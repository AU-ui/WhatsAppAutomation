/**
 * AI Integration — Ollama (local, free, no API key needed)
 *
 * Install Ollama: https://ollama.com
 * Then run:  ollama pull llama3.2
 * Ollama runs at http://localhost:11434 by default
 */

import { config } from '../config'
import { getDb } from '../database/db'
import { buildSystemPrompt } from './systemPrompts'
import { logger } from '../utils/logger'

export type ClaudeResponse = {
  text: string
  requestsHandoff: boolean
}

// ─── Conversation History ─────────────────────────────

function getConversationHistory(customerId: number): { role: string; content: string }[] {
  const db = getDb()
  const messages = db.prepare(`
    SELECT role, content FROM messages
    WHERE customer_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(customerId, config.ai.maxHistory) as { role: string; content: string }[]
  return messages.reverse()
}

export function saveMessage(customerId: number, role: 'user' | 'assistant', content: string): void {
  getDb().prepare(`
    INSERT INTO messages (customer_id, role, content, timestamp)
    VALUES (?, ?, ?, ?)
  `).run(customerId, role, content, Date.now())
}

// ─── Handoff keyword check ────────────────────────────

function containsHandoffKeyword(text: string): boolean {
  const lower = text.toLowerCase()
  return config.ai.handoffKeywords.some(keyword => lower.includes(keyword))
}

// ─── Ollama API call ──────────────────────────────────

async function callOllama(messages: { role: string; content: string }[], system: string): Promise<string> {
  const url = `${config.ai.ollamaUrl}/api/chat`

  const body = {
    model: config.ai.model,
    stream: false,
    messages: [
      { role: 'system', content: system },
      ...messages,
    ],
    options: {
      temperature: 0.7,
      num_predict: 512,   // max tokens per reply
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000), // 60s timeout
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Ollama error ${res.status}: ${err}`)
  }

  const data = await res.json() as { message?: { content: string }; error?: string }
  if (data.error) throw new Error(data.error)
  return data.message?.content?.trim() || ''
}

// ─── Main ask function ────────────────────────────────

export async function askClaude(
  customerId: number,
  userMessage: string,
  customerLanguage = 'auto',
  extraContext?: string
): Promise<ClaudeResponse> {
  // Save user message
  saveMessage(customerId, 'user', userMessage)

  // Fast-path: handoff keyword detected
  if (containsHandoffKeyword(userMessage)) {
    const msg = `Of course! Let me connect you with one of our team members right away. Please hold on for a moment.`
    saveMessage(customerId, 'assistant', msg)
    return { text: msg, requestsHandoff: true }
  }

  const history = getConversationHistory(customerId)
  // Remove duplicate last user message (already saved above)
  const last = history[history.length - 1]
  if (last?.role === 'user' && last.content === userMessage) history.pop()

  const system = buildSystemPrompt(customerLanguage) +
    (extraContext ? `\n\n## Current Session Context\n${extraContext}` : '')

  try {
    const fullText = await callOllama(
      [...history, { role: 'user', content: userMessage }],
      system
    )

    const requestsHandoff = fullText.includes('[HANDOFF_REQUESTED]')
    const cleanText = fullText.replace('[HANDOFF_REQUESTED]', '').trim()

    saveMessage(customerId, 'assistant', cleanText)
    logger.debug({ customerId, requestsHandoff }, 'Ollama response generated')

    return { text: cleanText, requestsHandoff }
  } catch (err: any) {
    logger.error({ err: err.message, customerId }, 'Ollama error')

    // If Ollama is not running, give a helpful fallback
    const isConnError = err.message?.includes('ECONNREFUSED') || err.message?.includes('fetch')
    const fallback = isConnError
      ? `I'm having trouble connecting to my AI brain right now. Type *MENU* to browse options or *AGENT* to speak with a human. 🙏`
      : `I didn't quite catch that. Could you rephrase? Or type *MENU* for options.`

    saveMessage(customerId, 'assistant', fallback)
    return { text: fallback, requestsHandoff: false }
  }
}

export function clearHistory(customerId: number): void {
  getDb().prepare(`DELETE FROM messages WHERE customer_id = ?`).run(customerId)
}
