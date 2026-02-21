/**
 * Broadcast Service — Bulk messaging with rate limiting, audience segmentation, and tracking
 */
import { getDb, generateId, nowIso, toJson, fromJson, parseBroadcast } from '../database/sqlite'
import * as WhatsApp from './whatsapp.service'
import { logger } from '../utils/logger'

const SEND_DELAY_MS = 1500

// ─── Execute Broadcast ────────────────────────────────────────────

export async function executeBroadcast(broadcastId: string): Promise<void> {
  const db = getDb()
  const broadcastRow = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(broadcastId) as Record<string, unknown> | undefined
  if (!broadcastRow) { logger.error({ broadcastId }, 'Broadcast not found'); return }
  const broadcast = parseBroadcast(broadcastRow)!

  const tenantRow = db.prepare('SELECT * FROM tenants WHERE id = ?').get(broadcast.tenantId) as Record<string, unknown> | undefined
  if (!tenantRow) { logger.error({ broadcastId }, 'Tenant not found for broadcast'); return }

  const whatsapp = fromJson<{ phoneNumberId: string; accessToken: string }>(tenantRow.whatsapp as string, { phoneNumberId: '', accessToken: '' })
  const businessName = tenantRow.businessName as string

  // Build recipient list
  const audience = broadcast.audience as Record<string, unknown>
  const conditions: string[] = ['tenantId = ?', 'isBlocked = 0']
  const params: unknown[] = [broadcast.tenantId]

  if (audience.optInOnly) { conditions.push('optIn = 1') }
  if (audience.type === 'segment' && audience.segment) { conditions.push('segment = ?'); params.push(audience.segment) }
  if (audience.type === 'custom_list' && Array.isArray(audience.customPhones) && audience.customPhones.length) {
    conditions.push(`phone IN (${(audience.customPhones as string[]).map(() => '?').join(',')})`)
    params.push(...(audience.customPhones as string[]))
  }

  let recipients = db.prepare(`SELECT id, phone, name, tags FROM customers WHERE ${conditions.join(' AND ')}`).all(...params) as { id: string; phone: string; name?: string; tags: string }[]

  if (audience.type === 'tags' && Array.isArray(audience.tags) && audience.tags.length) {
    recipients = recipients.filter(r => {
      const tags = fromJson<string[]>(r.tags, [])
      return (audience.tags as string[]).some(t => tags.includes(t))
    })
  }

  // Update broadcast status
  db.prepare(`UPDATE broadcasts SET status = 'running', startedAt = ?, updatedAt = ? WHERE id = ?`).run(nowIso(), nowIso(), broadcastId)
  const recipientList = recipients.map(r => ({ customerId: r.id, phone: r.phone, name: r.name || null, status: 'pending' }))
  db.prepare('UPDATE broadcasts SET recipients = ?, stats = ? WHERE id = ?').run(
    toJson(recipientList),
    toJson({ totalRecipients: recipients.length, sent: 0, failed: 0, delivered: 0, read: 0 }),
    broadcastId
  )

  logger.info({ broadcastId, recipients: recipients.length }, 'Broadcast started')

  let sent = 0
  let failed = 0

  for (const recipient of recipients) {
    try {
      let result: WhatsApp.WhatsAppApiResult = { success: false }
      const messageType = broadcast.messageType as string

      if (messageType === 'text' && broadcast.textContent) {
        const personalizedText = (broadcast.textContent as string)
          .replace(/\{\{name\}\}/gi, recipient.name || 'Valued Customer')
          .replace(/\{\{business\}\}/gi, businessName)

        result = await WhatsApp.sendText({
          phoneNumberId: whatsapp.phoneNumberId,
          accessToken: whatsapp.accessToken,
          to: recipient.phone,
          text: personalizedText,
        })
      } else if (messageType === 'template' && broadcast.templateName) {
        result = await WhatsApp.sendTemplate({
          phoneNumberId: whatsapp.phoneNumberId,
          accessToken: whatsapp.accessToken,
          to: recipient.phone,
          templateName: broadcast.templateName as string,
          language: 'en_US',
          components: broadcast.templateVariables
            ? buildTemplateComponents(broadcast.templateVariables as Record<string, string>, recipient.name)
            : undefined,
        })
      } else if (messageType === 'image' && broadcast.mediaUrl) {
        result = await WhatsApp.sendImage({
          phoneNumberId: whatsapp.phoneNumberId,
          accessToken: whatsapp.accessToken,
          to: recipient.phone,
          imageUrl: broadcast.mediaUrl as string,
          caption: broadcast.mediaCaption as string | undefined,
        })
      } else if (messageType === 'document' && broadcast.mediaUrl) {
        result = await WhatsApp.sendDocument({
          phoneNumberId: whatsapp.phoneNumberId,
          accessToken: whatsapp.accessToken,
          to: recipient.phone,
          documentUrl: broadcast.mediaUrl as string,
          caption: broadcast.mediaCaption as string | undefined,
        })
      }

      if (result.success) {
        sent++
        // Save to message history
        db.prepare(`
          INSERT INTO messages (id, tenantId, customerId, role, type, content, status, isFromBroadcast, broadcastId, createdAt)
          VALUES (?, ?, ?, 'assistant', ?, ?, 'sent', 1, ?, ?)
        `).run(generateId(), broadcast.tenantId, recipient.id, messageType, broadcast.textContent || `[${messageType} broadcast]`, broadcastId, nowIso())
      } else {
        failed++
      }
    } catch (err) {
      failed++
      logger.error({ err, phone: recipient.phone }, 'Broadcast send failed for recipient')
    }

    const delayMs = Math.ceil(1000 / ((broadcast.sendRate as number) || 1))
    await sleep(Math.max(delayMs, SEND_DELAY_MS))
  }

  // Mark completed
  db.prepare(`UPDATE broadcasts SET status = 'completed', completedAt = ?, stats = ?, updatedAt = ? WHERE id = ?`).run(
    nowIso(),
    toJson({ totalRecipients: recipients.length, sent, failed, delivered: 0, read: 0 }),
    nowIso(),
    broadcastId
  )

  logger.info({ broadcastId, sent, failed }, 'Broadcast completed')
}

// ─── Scheduled Broadcasts ────────────────────────────────────────

export async function runScheduledBroadcasts(): Promise<void> {
  const db = getDb()
  const now = nowIso()

  const dueBroadcasts = db.prepare(`SELECT id FROM broadcasts WHERE status = 'scheduled' AND scheduledAt <= ?`).all(now) as { id: string }[]
  if (dueBroadcasts.length === 0) return

  logger.info({ count: dueBroadcasts.length }, 'Running scheduled broadcasts')

  for (const b of dueBroadcasts) {
    executeBroadcast(b.id).catch((err) => logger.error({ err, broadcastId: b.id }, 'Scheduled broadcast error'))
  }
}

// ─── Auto Triggers ────────────────────────────────────────────────

export async function runAutoTriggers(tenantId: string): Promise<void> {
  const db = getDb()
  const now = new Date()
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()

  const tenantRow = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId) as Record<string, unknown> | undefined
  if (!tenantRow) return

  const whatsapp = fromJson<{ phoneNumberId: string; accessToken: string }>(tenantRow.whatsapp as string, { phoneNumberId: '', accessToken: '' })
  const businessName = tenantRow.businessName as string

  // Abandoned cart reminder
  const abandonedCustomers = db.prepare(`
    SELECT id, name, phone FROM customers
    WHERE tenantId = ? AND isBlocked = 0 AND optIn = 1
    AND conversationState IN ('BROWSING_CATALOG', 'BROWSING_CATEGORY', 'CHECKOUT')
    AND lastMessageAt < ? AND lastMessageAt > ?
  `).all(tenantId, hourAgo, oneDayAgo) as { id: string; name?: string; phone: string }[]

  for (const customer of abandonedCustomers) {
    if (customer.name) {
      await WhatsApp.sendText({
        phoneNumberId: whatsapp.phoneNumberId,
        accessToken: whatsapp.accessToken,
        to: customer.phone,
        text: `🛒 Hi *${customer.name}*! You left items in your cart at *${businessName}*.\n\nType *CART* to see your items.\n\n_Reply STOP to unsubscribe_`,
      })
    }
  }

  // Re-engagement
  const dormantCustomers = db.prepare(`
    SELECT id, name, phone FROM customers
    WHERE tenantId = ? AND isBlocked = 0 AND optIn = 1 AND totalOrders > 0 AND lastMessageAt < ?
    LIMIT 50
  `).all(tenantId, threeDaysAgo) as { id: string; name?: string; phone: string }[]

  for (const customer of dormantCustomers) {
    await WhatsApp.sendText({
      phoneNumberId: whatsapp.phoneNumberId,
      accessToken: whatsapp.accessToken,
      to: customer.phone,
      text: `👋 Hi *${customer.name || 'there'}*! We miss you at *${businessName}*.\n\nType *MENU* or *OFFERS* for exclusive deals. 🎁\n\n_Reply STOP to unsubscribe_`,
    })
    db.prepare('UPDATE customers SET lastMessageAt = ? WHERE id = ?').run(nowIso(), customer.id)
  }
}

// ─── Feedback Request ─────────────────────────────────────────────

export async function sendFeedbackRequest(tenantId: string, customerId: string, _orderId: string): Promise<void> {
  const db = getDb()
  const tenantRow = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId) as Record<string, unknown> | undefined
  const customerRow = db.prepare('SELECT phone FROM customers WHERE id = ?').get(customerId) as { phone: string } | undefined
  if (!tenantRow || !customerRow) return

  const whatsapp = fromJson<{ phoneNumberId: string; accessToken: string }>(tenantRow.whatsapp as string, { phoneNumberId: '', accessToken: '' })

  await WhatsApp.sendText({
    phoneNumberId: whatsapp.phoneNumberId,
    accessToken: whatsapp.accessToken,
    to: customerRow.phone,
    text:
      `⭐ *How was your experience at ${tenantRow.businessName}?*\n\n` +
      `Rate us:\n*5* — Excellent 😍\n*4* — Great 😊\n*3* — Good 🙂\n*2* — Fair 😐\n*1* — Poor 😞\n\n` +
      `Your feedback helps us improve! 🙏`,
  })
}

// ─── Appointment Reminder ─────────────────────────────────────────

export async function sendAppointmentReminder(tenantId: string, orderId: string): Promise<void> {
  const db = getDb()
  const tenantRow = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId) as Record<string, unknown> | undefined
  const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Record<string, unknown> | undefined
  if (!tenantRow || !orderRow) return

  const customerRow = db.prepare('SELECT name, phone FROM customers WHERE id = ?').get(orderRow.customerId as string) as { name?: string; phone: string } | undefined
  if (!customerRow) return

  const whatsapp = fromJson<{ phoneNumberId: string; accessToken: string }>(tenantRow.whatsapp as string, { phoneNumberId: '', accessToken: '' })
  const scheduledAt = orderRow.scheduledAt ? new Date(orderRow.scheduledAt as string) : null
  if (!scheduledAt) return

  const dateStr = scheduledAt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = scheduledAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  await WhatsApp.sendText({
    phoneNumberId: whatsapp.phoneNumberId,
    accessToken: whatsapp.accessToken,
    to: customerRow.phone,
    text:
      `⏰ *Appointment Reminder — ${tenantRow.businessName}*\n\n` +
      `Hi ${customerRow.name || 'there'}!\n\n` +
      `📅 *${dateStr}*\n🕐 *${timeStr}*\n📍 ${tenantRow.address || ''}\n\n` +
      `To reschedule, call us at ${tenantRow.phone || ''}\n\nSee you soon! 😊`,
  })
}

// ─── New Product Notification ─────────────────────────────────────

export async function notifyNewProduct(
  tenantId: string,
  productName: string,
  productDescription: string,
  productPrice: number,
  currency: string
): Promise<void> {
  const db = getDb()
  const tenantRow = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId) as Record<string, unknown> | undefined
  if (!tenantRow) return

  const whatsapp = fromJson<{ phoneNumberId: string; accessToken: string }>(tenantRow.whatsapp as string, { phoneNumberId: '', accessToken: '' })
  const subscribers = db.prepare('SELECT phone, name FROM customers WHERE tenantId = ? AND isBlocked = 0 AND optIn = 1').all(tenantId) as { phone: string; name?: string }[]

  const msg =
    `🆕 *New Arrival at ${tenantRow.businessName}!*\n\n` +
    `*${productName}*\n${productDescription}\n\n` +
    `💰 Price: ${currency} ${productPrice.toFixed(2)}\n\n` +
    `Type *CATALOG* to shop now! 🛍️\n\n_Reply STOP to unsubscribe_`

  for (const sub of subscribers) {
    await WhatsApp.sendText({ phoneNumberId: whatsapp.phoneNumberId, accessToken: whatsapp.accessToken, to: sub.phone, text: msg })
    await sleep(SEND_DELAY_MS)
  }

  logger.info({ tenantId, product: productName, subscribers: subscribers.length }, 'New product notification sent')
}

// ─── Offer / Discount Notification (Auto-triggered, niche-specific) ────────

export async function notifyOfferProduct(
  tenantId: string,
  productName: string,
  productDescription: string,
  originalPrice: number,
  discountedPrice: number,
  currency: string
): Promise<void> {
  const db = getDb()
  const tenantRow = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId) as Record<string, unknown> | undefined
  if (!tenantRow) return

  const whatsapp = fromJson<{ phoneNumberId: string; accessToken: string }>(tenantRow.whatsapp as string, { phoneNumberId: '', accessToken: '' })
  if (!whatsapp.phoneNumberId || !whatsapp.accessToken) return

  const subscribers = db.prepare('SELECT phone, name FROM customers WHERE tenantId = ? AND isBlocked = 0 AND optIn = 1').all(tenantId) as { phone: string; name?: string }[]
  if (subscribers.length === 0) return

  const businessType = (tenantRow.businessType as string) || 'general'
  const businessName = tenantRow.businessName as string
  const savings = Math.round(((originalPrice - discountedPrice) / originalPrice) * 100)

  const template = buildNicheOfferMessage(businessType, businessName, productName, productDescription, originalPrice, discountedPrice, currency, savings)

  for (const sub of subscribers) {
    const msg = template.replace(/\{\{name\}\}/gi, sub.name || 'Valued Customer')
    await WhatsApp.sendText({ phoneNumberId: whatsapp.phoneNumberId, accessToken: whatsapp.accessToken, to: sub.phone, text: msg })
    await sleep(SEND_DELAY_MS)
  }

  logger.info({ tenantId, product: productName, subscribers: subscribers.length, businessType }, 'Offer notification auto-sent')
}

function buildNicheOfferMessage(
  businessType: string,
  businessName: string,
  productName: string,
  description: string,
  originalPrice: number,
  discountedPrice: number,
  currency: string,
  savings: number
): string {
  const priceBlock = `~~${currency} ${originalPrice.toFixed(2)}~~ → *${currency} ${discountedPrice.toFixed(2)}* (${savings}% OFF)`
  const desc = description ? `${description}\n\n` : ''

  switch (businessType) {
    case 'hotel':
      return `🏨 *Exclusive Room Offer — ${businessName}!*\n\nHi {{name}}! 👋\n\n🛏️ *${productName}*\n${desc}💰 ${priceBlock}\n\n✨ Limited availability — book now!\nType *BOOK* to reserve.\n\n_Reply STOP to unsubscribe_`

    case 'restaurant':
      return `🍽️ *Today's Special — ${businessName}!*\n\nHi {{name}}! 👋\n\n🌟 *${productName}*\n${desc}💰 ${priceBlock}\n\n⏰ Limited time offer — order now!\nType *ORDER* to place your order.\n\n_Reply STOP to unsubscribe_`

    case 'grocery':
      return `🛒 *Flash Sale — ${businessName}!*\n\nHi {{name}}! 👋\n\n🎯 *${productName}*\n${desc}💰 ${priceBlock}\n\n⚡ Grab it before it's gone!\nType *CATALOG* to shop now.\n\n_Reply STOP to unsubscribe_`

    case 'real_estate':
      return `🏠 *Exclusive Property Deal — ${businessName}!*\n\nHi {{name}}! 👋\n\n🏗️ *${productName}*\n${desc}💰 ${priceBlock}\n\n📋 Limited offer — act fast!\nType *SITE VISIT* to schedule a viewing.\n\n_Reply STOP to unsubscribe_`

    case 'clinic':
      return `🏥 *Health Package Offer — ${businessName}!*\n\nHi {{name}}! 👋\n\n🩺 *${productName}*\n${desc}💰 ${priceBlock}\n\n📅 Book your appointment today!\nType *APPOINTMENT* to book.\n\n_Reply STOP to unsubscribe_`

    case 'salon':
      return `💅 *Beauty Deal — ${businessName}!*\n\nHi {{name}}! 👋\n\n✨ *${productName}*\n${desc}💰 ${priceBlock}\n\n📅 Limited slots — book now!\nType *BOOK* to schedule.\n\n_Reply STOP to unsubscribe_`

    case 'agency_travel':
      return `✈️ *Travel Deal — ${businessName}!*\n\nHi {{name}}! 👋\n\n🌍 *${productName}*\n${desc}💰 ${priceBlock}\n\n🗓️ Book now to lock in this price!\nType *BOOK* to enquire.\n\n_Reply STOP to unsubscribe_`

    case 'wholesaler':
      return `📦 *Wholesale Deal — ${businessName}!*\n\nHi {{name}}! 👋\n\n🎯 *${productName}*\n${desc}💰 ${priceBlock}\n\n📦 Bulk order discounts available!\nType *ORDER* to place your order.\n\n_Reply STOP to unsubscribe_`

    case 'retail':
      return `🏪 *Special Offer — ${businessName}!*\n\nHi {{name}}! 👋\n\n🎁 *${productName}*\n${desc}💰 ${priceBlock}\n\n🛍️ Shop now!\nType *CATALOG* to browse.\n\n_Reply STOP to unsubscribe_`

    default:
      return `🔥 *Special Offer — ${businessName}!*\n\nHi {{name}}! 👋\n\n🎁 *${productName}*\n${desc}💰 ${priceBlock}\n\n⚡ Limited time deal!\nType *OFFERS* to see all deals.\n\n_Reply STOP to unsubscribe_`
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildTemplateComponents(variables: Record<string, string>, recipientName?: string | null): WhatsApp.TemplateComponent[] {
  const bodyParams = Object.entries(variables).map(([, val]) => ({
    type: 'text' as const,
    text: val.replace(/\{\{name\}\}/gi, recipientName || 'Customer'),
  }))
  return [{ type: 'body', parameters: bodyParams }]
}
