/**
 * AI Service — OpenAI GPT integration for intelligent auto-replies
 */
import OpenAI from 'openai'
import { config } from '../config'
import { logger } from '../utils/logger'
import { getDb } from '../database/sqlite'
import type { TenantRecord } from '../middleware/auth.middleware'

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!config.openai.apiKey) throw new Error('OpenAI API key not configured')
    openaiClient = new OpenAI({ apiKey: config.openai.apiKey })
  }
  return openaiClient
}

export interface AiReplyResult {
  text: string
  intent?: string
  suggestedAction?: string
  requestsHandoff?: boolean
  confidence?: number
}

function buildSystemPrompt(tenant: TenantRecord, customer: Record<string, unknown>): string {
  const toneMap: Record<string, string> = {
    professional: 'professional and polished',
    friendly: 'warm and friendly',
    casual: 'casual and conversational',
    formal: 'formal and respectful',
  }
  const tone = toneMap[(tenant.settings.brandTone as string) || 'friendly'] || 'friendly'

  const businessContextMap: Record<string, string> = {
    hotel: 'You assist hotel guests with room availability, bookings, amenities, check-in/out, and special requests.',
    restaurant: 'You assist diners with the menu, table reservations, takeaway orders, and promotions.',
    grocery: "You assist shoppers with product availability, today's deals, order placement, and delivery tracking.",
    retail_sme: 'You assist customers with product catalog, pricing, availability, orders, and after-sales support.',
    agency_marketing: 'You assist clients with marketing packages, campaign consultations, and pricing.',
    agency_travel: 'You assist travelers with travel packages, itineraries, bookings, and travel tips.',
    agency_recruitment: 'You assist job seekers and employers with job listings and placement services.',
    vendor_distributor: 'You assist wholesale buyers with product catalogs, bulk pricing, and delivery timelines.',
    real_estate: 'You assist property seekers with listings, site visits, pricing, and investment advice.',
    clinic: 'You assist patients with appointment booking, doctor availability, services, and health FAQs.',
    salon: 'You assist clients with service menus, appointment booking, and beauty tips.',
    ecommerce: 'You assist online shoppers with product discovery, cart management, and order tracking.',
    service: 'You assist clients with service bookings, pricing, and support queries.',
    general: 'You assist customers with general inquiries about products, services, pricing, and support.',
  }

  const businessContext = businessContextMap[tenant.businessType] || businessContextMap.general
  const tags = Array.isArray(customer.tags) ? (customer.tags as string[]).join(', ') : ''

  return `You are an AI customer assistant for *${tenant.businessName}* (${tenant.businessType} business).
Your communication style is ${tone}.

${businessContext}

Business details:
- Business name: ${tenant.businessName}
- Phone: ${tenant.phone || 'Not provided'}
- Website: ${tenant.website || 'Not provided'}
- Currency: ${tenant.currency || 'USD'}

The customer's name is: ${(customer.name as string) || 'valued customer'}
Customer tags: ${tags}

IMPORTANT RULES:
1. Reply in the same language the customer uses
2. Keep replies concise (3-5 sentences max for WhatsApp)
3. Never make up information — if unsure, say you'll check and follow up
4. End responses with a clear next step or question
5. If customer types keywords like 'human', 'agent', 'manager', respond with: [HANDOFF_REQUESTED]`
}

export async function generateAiReply(
  tenant: TenantRecord,
  customer: Record<string, unknown>,
  userMessage: string,
  maxHistoryMessages = 10
): Promise<AiReplyResult> {
  const startTime = Date.now()

  try {
    const openai = getOpenAIClient()
    const db = getDb()

    // Fetch recent message history
    const history = db.prepare(`
      SELECT role, content FROM messages
      WHERE tenantId = ? AND customerId = ? AND role IN ('user', 'assistant')
      ORDER BY createdAt DESC LIMIT ?
    `).all(tenant.id, customer.id, maxHistoryMessages) as { role: string; content: string }[]

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildSystemPrompt(tenant, customer) },
      ...history.reverse().map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content || '',
      })),
      { role: 'user', content: userMessage },
    ]

    const completion = await openai.chat.completions.create({
      model: config.openai.model,
      messages,
      max_tokens: config.openai.maxTokens,
      temperature: 0.7,
    })

    const responseText = completion.choices[0]?.message?.content || "I'm here to help! Could you please clarify your question?"
    const processingMs = Date.now() - startTime

    const requestsHandoff = responseText.includes('[HANDOFF_REQUESTED]')
    const cleanText = responseText.replace('[HANDOFF_REQUESTED]', '').trim()
    const intent = classifyIntent(userMessage)

    logger.debug({ processingMs, tokens: completion.usage?.total_tokens, intent }, 'AI reply generated')

    return { text: cleanText, intent, requestsHandoff, confidence: 0.9 }
  } catch (err: unknown) {
    const error = err as Error
    logger.error({ err: error.message }, 'AI reply generation failed')
    return {
      text: `Thank you for reaching out to ${tenant.businessName}! Let me connect you with our team.`,
      requestsHandoff: true,
      confidence: 0,
    }
  }
}

function classifyIntent(message: string): string {
  const msg = message.toLowerCase()
  if (/price|cost|how much|rate|fee/.test(msg)) return 'pricing_inquiry'
  if (/book|reserve|appointment|schedule/.test(msg)) return 'booking_request'
  if (/menu|catalog|product|service|offer/.test(msg)) return 'catalog_browse'
  if (/order|buy|purchase|checkout/.test(msg)) return 'purchase_intent'
  if (/status|track|where|delivery/.test(msg)) return 'order_status'
  if (/cancel|refund|return|complaint/.test(msg)) return 'complaint'
  if (/hello|hi|hey|good morning/.test(msg)) return 'greeting'
  if (/thank|thanks|appreciate/.test(msg)) return 'thanks'
  if (/location|address|where are you/.test(msg)) return 'location_inquiry'
  if (/hours|timing|open|close/.test(msg)) return 'hours_inquiry'
  if (/human|agent|person|manager/.test(msg)) return 'handoff_request'
  return 'general_inquiry'
}

export async function detectLanguage(text: string): Promise<string> {
  try {
    const openai = getOpenAIClient()
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `Detect the language of this text and respond with only the ISO 639-1 code (e.g., 'en', 'hi', 'ar'): "${text}"` }],
      max_tokens: 5,
    })
    return res.choices[0]?.message?.content?.trim().toLowerCase() || 'en'
  } catch {
    return 'en'
  }
}
