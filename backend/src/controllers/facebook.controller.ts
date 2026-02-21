/**
 * Facebook Lead Ads Webhook Controller
 *
 * Handles:
 * 1. GET /api/webhook/fb-leads — Meta webhook verification challenge
 * 2. POST /api/webhook/fb-leads — Incoming Facebook/Instagram lead notifications
 *
 * Flow: Facebook Ad → Lead Form filled → Facebook POSTs leadgen_id here
 *       → We fetch lead from Graph API → Create customer → Send WhatsApp message
 */

import { Request, Response } from 'express'
import axios from 'axios'
import { config } from '../config'
import { getDb, generateId, nowIso, toJson, fromJson } from '../database/sqlite'
import { logger } from '../utils/logger'
import * as WhatsApp from '../services/whatsapp.service'

// ─── GET: Webhook Verification ────────────────────────────────────

export function verifyFbWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === config.meta.verifyToken) {
    logger.info('Facebook Lead Ads webhook verified successfully')
    res.status(200).send(challenge)
    return
  }

  logger.warn({ mode, token }, 'Facebook Lead Ads webhook verification failed')
  res.sendStatus(403)
}

// ─── POST: Receive Lead Notification ─────────────────────────────

export async function handleFbLeadWebhook(req: Request, res: Response): Promise<void> {
  // Respond 200 immediately — Facebook requires a fast response
  res.sendStatus(200)

  try {
    const body = req.body
    if (body.object !== 'page') return

    const entries = (body.entry || []) as Record<string, unknown>[]
    for (const entry of entries) {
      const changes = (entry.changes || []) as Record<string, unknown>[]
      for (const change of changes) {
        if (change.field === 'leadgen') {
          await processLeadChange(change.value as Record<string, unknown>)
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'Facebook lead webhook processing error')
  }
}

// ─── Process Lead Change ──────────────────────────────────────────

async function processLeadChange(value: Record<string, unknown>): Promise<void> {
  const leadgenId = value.leadgen_id as string
  const pageId = value.page_id as string

  if (!leadgenId || !pageId) return

  const db = getDb()

  // Find tenant by facebookPageId stored in their settings JSON
  const allTenants = db.prepare('SELECT * FROM tenants WHERE isActive = 1').all() as Record<string, unknown>[]
  let tenantRow: Record<string, unknown> | undefined
  for (const t of allTenants) {
    const tenantSettings = fromJson<{ facebookPageId?: string }>(t.settings as string, {})
    if (tenantSettings.facebookPageId === pageId) {
      tenantRow = t
      break
    }
  }

  if (!tenantRow) {
    logger.warn({ pageId }, 'No tenant found for Facebook Page ID')
    return
  }

  const tenantSettings = fromJson<{
    facebookPageAccessToken?: string
    facebookLeadWelcomeMessage?: string
  }>(tenantRow.settings as string, {})

  const pageAccessToken = tenantSettings.facebookPageAccessToken
  if (!pageAccessToken) {
    logger.warn({ tenantId: tenantRow.id }, 'No Facebook Page Access Token configured for tenant')
    return
  }

  // ── Fetch lead details from Meta Graph API ──
  let fullName = ''
  let phoneNumber = ''
  let email = ''

  try {
    const graphUrl = `${config.meta.graphApiBaseUrl}/${config.meta.graphApiVersion}/${leadgenId}`
    const { data } = await axios.get(graphUrl, {
      params: { fields: 'field_data', access_token: pageAccessToken },
      timeout: 10000,
    })

    const fieldData = (data.field_data || []) as { name: string; values: string[] }[]
    for (const field of fieldData) {
      const fieldName = field.name.toLowerCase()
      const val = field.values?.[0] || ''
      if (fieldName === 'full_name' || fieldName === 'name') fullName = val
      else if (fieldName === 'phone_number' || fieldName === 'phone') phoneNumber = val
      else if (fieldName === 'email') email = val
    }
  } catch (err) {
    logger.error({ err, leadgenId }, 'Failed to fetch lead details from Graph API')
    return
  }

  if (!phoneNumber) {
    logger.warn({ leadgenId }, 'Lead has no phone number — cannot send WhatsApp message')
    return
  }

  // Normalize phone: strip non-digits
  const normalizedPhone = phoneNumber.replace(/\D/g, '')
  if (normalizedPhone.length < 7) {
    logger.warn({ phoneNumber }, 'Lead phone number too short — skipping')
    return
  }

  const tenantId = tenantRow.id as string

  // ── Find or create customer ──
  let customerRow = db
    .prepare('SELECT * FROM customers WHERE tenantId = ? AND phone = ?')
    .get(tenantId, normalizedPhone) as Record<string, unknown> | undefined
  const isNewCustomer = !customerRow

  if (!customerRow) {
    const newCustomerId = generateId()
    const now = nowIso()
    db.prepare(`
      INSERT INTO customers (id, tenantId, phone, name, email, optIn, conversationState, tags, leadScore, createdAt, firstSeenAt, lastMessageAt)
      VALUES (?, ?, ?, ?, ?, 1, 'MENU', ?, 10, ?, ?, ?)
    `).run(
      newCustomerId, tenantId, normalizedPhone,
      fullName || null, email || null,
      toJson(['facebook_lead']),
      now, now, now
    )
    customerRow = db.prepare('SELECT * FROM customers WHERE id = ?').get(newCustomerId) as Record<string, unknown>
    logger.info({ tenantId, phone: normalizedPhone }, 'New customer created from Facebook lead')
  } else {
    // Update name/email if lead provides them and we don't have them
    if (fullName && !customerRow.name) {
      db.prepare('UPDATE customers SET name = ? WHERE id = ?').run(fullName, customerRow.id)
    }
    if (email && !customerRow.email) {
      db.prepare('UPDATE customers SET email = ? WHERE id = ?').run(email, customerRow.id)
    }
    // Add facebook_lead tag if not already present
    const existingTags = fromJson<string[]>(customerRow.tags as string, [])
    if (!existingTags.includes('facebook_lead')) {
      existingTags.push('facebook_lead')
      db.prepare('UPDATE customers SET tags = ? WHERE id = ?').run(toJson(existingTags), customerRow.id)
    }
  }

  // ── Get tenant's WhatsApp credentials ──
  const waConfig = fromJson<{ phoneNumberId?: string; accessToken?: string }>(
    tenantRow.whatsapp as string, {}
  )

  if (!waConfig.phoneNumberId || !waConfig.accessToken) {
    logger.warn({ tenantId }, 'Tenant has no WhatsApp credentials configured')
    return
  }

  // ── Build and send welcome message ──
  const defaultMessage =
    `👋 Hi {{name}}! Thanks for your interest. We'll be in touch shortly.\n\nReply *MENU* to explore what we offer.`
  const rawMessage = tenantSettings.facebookLeadWelcomeMessage || defaultMessage
  const message = rawMessage.replace(/\{\{name\}\}/g, fullName || 'there')

  const result = await WhatsApp.sendText({
    phoneNumberId: waConfig.phoneNumberId,
    accessToken: waConfig.accessToken,
    to: normalizedPhone,
    text: message,
  })

  if (result.success) {
    // Save outgoing message record
    db.prepare(`
      INSERT INTO messages (id, tenantId, customerId, role, type, content, status, metaMessageId, createdAt)
      VALUES (?, ?, ?, 'assistant', 'text', ?, 'sent', ?, ?)
    `).run(
      generateId(), tenantId, customerRow.id,
      message, result.messageId || null, nowIso()
    )
    logger.info({ tenantId, phone: normalizedPhone, leadgenId }, 'Facebook lead WhatsApp welcome sent')
  } else {
    logger.error({ tenantId, phone: normalizedPhone, error: result.error }, 'Failed to send WhatsApp to Facebook lead')
  }

  // ── Update analytics ──
  await incrementLeadStats(tenantId, isNewCustomer)
}

// ─── Analytics ────────────────────────────────────────────────────

async function incrementLeadStats(tenantId: string, isNewCustomer: boolean): Promise<void> {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)

  const existing = db
    .prepare('SELECT * FROM analytics WHERE tenantId = ? AND date = ?')
    .get(tenantId, today) as Record<string, unknown> | undefined

  if (!existing) {
    db.prepare(`
      INSERT INTO analytics (id, tenantId, date, messages, customers, orders, revenue, broadcasts, hourlyMessages)
      VALUES (?, ?, ?, ?, ?, '{}', '{}', '{}', ?)
    `).run(
      generateId(), tenantId, today,
      toJson({ incoming: 0, outgoing: 1, aiGenerated: 0 }),
      toJson(isNewCustomer ? { new: 1 } : {}),
      toJson(new Array(24).fill(0))
    )
  } else {
    const msgs = fromJson<{ outgoing?: number }>(existing.messages as string, {})
    msgs.outgoing = (msgs.outgoing || 0) + 1
    db.prepare('UPDATE analytics SET messages = ? WHERE tenantId = ? AND date = ?')
      .run(toJson(msgs), tenantId, today)

    if (isNewCustomer) {
      const customers = fromJson<{ new?: number }>(existing.customers as string, {})
      customers.new = (customers.new || 0) + 1
      db.prepare('UPDATE analytics SET customers = ? WHERE tenantId = ? AND date = ?')
        .run(toJson(customers), tenantId, today)
    }
  }
}
