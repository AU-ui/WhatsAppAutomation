/**
 * Webhook Controller — Core of the entire platform
 *
 * Handles:
 * 1. GET /webhook — Meta verification challenge
 * 2. POST /webhook — All incoming WhatsApp messages, statuses, and events
 */

import { Request, Response } from 'express'
import crypto from 'crypto'
import { config } from '../config'
import { getDb, generateId, nowIso, toJson, fromJson, parseCustomer } from '../database/sqlite'
import { TenantRecord } from '../middleware/auth.middleware'
import { logger } from '../utils/logger'
import * as WhatsApp from '../services/whatsapp.service'
import { generateAiReply } from '../services/ai.service'
import { processBusinessFlow } from '../services/businessFlows.service'

// Rate limiting: tenantId:phone → { ts, count }
const rateLimits = new Map<string, { ts: number; count: number }>()

function isRateLimited(key: string, maxPerMin = 20): boolean {
  const now = Date.now()
  const entry = rateLimits.get(key)
  if (!entry || now - entry.ts > 60_000) {
    rateLimits.set(key, { ts: now, count: 1 })
    return false
  }
  if (entry.count >= maxPerMin) return true
  entry.count++
  return false
}

// ─── GET: Meta Webhook Verification ──────────────────────────────

export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === config.meta.verifyToken) {
    logger.info('Meta webhook verified successfully')
    res.status(200).send(challenge)
    return
  }

  logger.warn({ mode, token }, 'Webhook verification failed')
  res.sendStatus(403)
}

// ─── POST: Incoming Events ────────────────────────────────────────

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  res.sendStatus(200)

  try {
    if (config.meta.appSecret && !validateSignature(req)) {
      logger.warn('Invalid webhook signature — rejecting')
      return
    }

    const body = req.body
    if (body.object !== 'whatsapp_business_account') return

    const entries = body.entry || []
    for (const entry of entries) {
      const changes = entry.changes || []
      for (const change of changes) {
        if (change.field === 'messages') {
          await processChange(change.value)
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'Webhook processing error')
  }
}

// ─── Process Single Change ────────────────────────────────────────

async function processChange(value: Record<string, unknown>): Promise<void> {
  const phoneNumberId = (value.metadata as Record<string, string>)?.phone_number_id
  if (!phoneNumberId) return

  const db = getDb()
  // Find tenant by phoneNumberId (stored in JSON whatsapp field)
  const allTenants = db.prepare('SELECT * FROM tenants WHERE isActive = 1').all() as Record<string, unknown>[]
  let tenantRow: Record<string, unknown> | undefined
  for (const t of allTenants) {
    const wa = fromJson<{ phoneNumberId?: string }>(t.whatsapp as string, {})
    if (wa.phoneNumberId === phoneNumberId) {
      tenantRow = t
      break
    }
  }

  if (!tenantRow) {
    logger.warn({ phoneNumberId }, 'No tenant found for phoneNumberId')
    return
  }

  const tenant = parseTenantFull(tenantRow)

  // Check subscription
  if (tenant.subscription.status === 'canceled') {
    logger.info({ tenantId: tenant.id }, 'Tenant subscription canceled — ignoring')
    return
  }

  // Process incoming messages
  const messages = (value.messages as Record<string, unknown>[]) || []
  for (const msg of messages) {
    await processIncomingMessage(tenant, msg, phoneNumberId)
  }

  // Process status updates
  const statuses = (value.statuses as Record<string, unknown>[]) || []
  for (const status of statuses) {
    await processStatusUpdate(status)
  }
}

// ─── Process Individual Message ───────────────────────────────────

async function processIncomingMessage(
  tenant: TenantRecord,
  rawMsg: Record<string, unknown>,
  phoneNumberId: string
): Promise<void> {
  const fromPhone = rawMsg.from as string
  const msgType = rawMsg.type as string
  const msgId = rawMsg.id as string

  let text = ''
  let mediaUrl = ''

  switch (msgType) {
    case 'text':
      text = ((rawMsg.text as Record<string, string>)?.body || '').trim()
      break
    case 'interactive': {
      const interactive = rawMsg.interactive as Record<string, unknown>
      const interactiveType = interactive.type as string
      if (interactiveType === 'list_reply') {
        text = ((interactive.list_reply as Record<string, string>)?.id || '').trim()
        if (!text) text = (interactive.list_reply as Record<string, string>)?.title
      } else if (interactiveType === 'button_reply') {
        text = ((interactive.button_reply as Record<string, string>)?.id || '').trim()
        if (!text) text = (interactive.button_reply as Record<string, string>)?.title
      }
      break
    }
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
      text = ((rawMsg[msgType] as Record<string, string>)?.caption || '').trim()
      mediaUrl = (rawMsg[msgType] as Record<string, string>)?.id || ''
      break
    default:
      logger.debug({ msgType }, 'Unhandled message type')
      return
  }

  if (!text && !mediaUrl) return

  const tenantId = tenant.id
  const rateLimitKey = `${tenantId}:${fromPhone}`
  if (isRateLimited(rateLimitKey)) {
    logger.warn({ tenantId, fromPhone }, 'Rate limited')
    return
  }

  // Acknowledge read
  await WhatsApp.markMessageRead({
    phoneNumberId,
    accessToken: tenant.whatsapp.accessToken,
    messageId: msgId,
  })

  const db = getDb()

  // Find or create customer
  let customerRow = db.prepare('SELECT * FROM customers WHERE tenantId = ? AND phone = ?').get(tenantId, fromPhone) as Record<string, unknown> | undefined
  const isNewCustomer = !customerRow

  if (!customerRow) {
    const newCustomerId = generateId()
    const now = nowIso()
    db.prepare(`
      INSERT INTO customers (id, tenantId, phone, optIn, conversationState, createdAt, firstSeenAt, lastMessageAt)
      VALUES (?, ?, ?, 1, 'IDLE', ?, ?, ?)
    `).run(newCustomerId, tenantId, fromPhone, now, now, now)
    customerRow = db.prepare('SELECT * FROM customers WHERE id = ?').get(newCustomerId) as Record<string, unknown>
    logger.info({ tenantId, phone: fromPhone }, 'New customer created')
  }

  const customer = parseCustomer(customerRow)!

  if (customer.isBlocked) {
    logger.warn({ phone: fromPhone }, 'Blocked customer — ignoring')
    return
  }

  if (!customer.optIn && !isNewCustomer) {
    logger.debug({ phone: fromPhone }, 'Customer opted out — ignoring')
    return
  }

  // Update last seen
  db.prepare('UPDATE customers SET totalMessages = totalMessages + 1, lastMessageAt = ? WHERE id = ?').run(nowIso(), customer.id)

  // Save incoming message
  db.prepare(`
    INSERT INTO messages (id, tenantId, customerId, role, type, content, mediaUrl, status, metaMessageId, createdAt)
    VALUES (?, ?, ?, 'user', ?, ?, ?, 'delivered', ?, ?)
  `).run(generateId(), tenantId, customer.id, msgType, text || `[${msgType}]`, mediaUrl || null, msgId, nowIso())

  // ── Send helpers ──
  const send = async (to: string, message: string): Promise<void> => {
    const result = await WhatsApp.sendText({
      phoneNumberId,
      accessToken: tenant.whatsapp.accessToken,
      to,
      text: message,
    })
    if (result.success) {
      db.prepare(`
        INSERT INTO messages (id, tenantId, customerId, role, type, content, status, metaMessageId, createdAt)
        VALUES (?, ?, ?, 'assistant', 'text', ?, 'sent', ?, ?)
      `).run(generateId(), tenantId, customer.id, message, result.messageId || null, nowIso())
    }
    await incrementOutgoingStats(tenantId)
    // Increment message usage
    const tenantRow2 = db.prepare('SELECT subscription FROM tenants WHERE id = ?').get(tenantId) as { subscription: string }
    const sub = fromJson<{ messagesUsedThisMonth?: number }>(tenantRow2.subscription, {})
    sub.messagesUsedThisMonth = (sub.messagesUsedThisMonth || 0) + 1
    db.prepare('UPDATE tenants SET subscription = ? WHERE id = ?').run(toJson(sub), tenantId)
  }

  const sendImage = async (to: string, imageUrl: string, caption?: string): Promise<void> => {
    await WhatsApp.sendImage({ phoneNumberId, accessToken: tenant.whatsapp.accessToken, to, imageUrl, caption })
  }

  const sendDoc = async (to: string, documentUrl: string, filename?: string, caption?: string): Promise<void> => {
    await WhatsApp.sendDocument({ phoneNumberId, accessToken: tenant.whatsapp.accessToken, to, documentUrl, filename, caption })
  }

  // Update analytics
  await incrementIncomingStats(tenantId)

  let upperText = text.toUpperCase().trim()
  const convState = (customer.conversationState as string) || 'MENU'
  const convContext = (customer.conversationContext as Record<string, unknown>) || {}

  // ── GLOBAL STATE: CHECKOUT ──
  if (convState === 'CHECKOUT') {
    await handleCheckoutState(tenant, customer, text, upperText, fromPhone, send, tenantId, phoneNumberId)
    return
  }

  // ── GLOBAL STATE: BOOKING DATE ──
  if (convState === 'BOOKING_DATE') {
    await send(fromPhone,
      `📅 *Booking received!*\n\n` +
      `Our team will confirm your appointment shortly.\n\n` +
      `📞 ${tenant.phone || ''}\n📧 ${tenant.email || ''}\n\nType *MENU* to return to main menu.`
    )
    db.prepare('UPDATE customers SET conversationState = ? WHERE id = ?').run('MENU', customer.id)
    return
  }

  // ── BRAND NEW CUSTOMER: Welcome flow ──
  if (isNewCustomer || (!(customer.name as string) && convState !== 'REGISTERING')) {
    db.prepare('UPDATE customers SET conversationState = ? WHERE id = ?').run('REGISTERING', customer.id)
    const welcomeMsg = ((tenant.settings.welcomeMessage as string) || '👋 Welcome to {BUSINESS_NAME}!')
      .replace(/\{BUSINESS_NAME\}/g, tenant.businessName)
    await send(fromPhone, `${welcomeMsg}\n\nTo get started, what's your name? 😊`)
    return
  }

  // ── REGISTERING: Capture name ──
  if (convState === 'REGISTERING') {
    const name = text.trim().split(/\s+/).slice(0, 4).join(' ')
    if (name.length < 2) {
      await send(fromPhone, `Please share your name so I can assist you better 😊`)
      return
    }
    const currentTags = (customer.tags as string[]) || []
    if (!currentTags.includes('new')) currentTags.push('new')
    db.prepare('UPDATE customers SET name = ?, conversationState = ?, tags = ?, leadScore = 5 WHERE id = ?')
      .run(name, 'MENU', toJson(currentTags), customer.id)

    await send(fromPhone,
      `🎉 Welcome, *${name}*!\n\n` +
      `You're now connected with *${tenant.businessName}*.\n\n` +
      buildMainMenu(tenant)
    )
    return
  }

  // ── NUMBER SHORTCUTS: map menu numbers to commands ──
  const menuMap: Record<string, Record<string, string>> = {
    hotel:              { '1': 'ROOMS', '2': 'BOOK', '3': 'AMENITIES', '4': 'CONTACT', '5': 'AI' },
    restaurant:         { '1': 'MENU', '2': 'ORDER', '3': 'TABLE', '4': 'OFFERS', '5': 'AI' },
    grocery:            { '1': 'CATALOG', '2': 'DEALS', '3': 'ORDER GROCERIES', '4': 'TRACK', '5': 'AI' },
    real_estate:        { '1': 'PROPERTIES', '2': 'SITE VISIT', '3': 'PRICING', '4': 'CONTACT', '5': 'AI' },
    clinic:             { '1': 'SERVICES', '2': 'APPOINTMENT', '3': 'PRICING', '4': 'HOURS', '5': 'AI' },
    salon:              { '1': 'SERVICES', '2': 'BOOK', '3': 'PRICING', '4': 'HOURS', '5': 'AI' },
    agency_travel:      { '1': 'PACKAGES', '2': 'BOOK', '3': 'QUOTE', '4': 'CONTACT', '5': 'AI' },
    agency_recruitment: { '1': 'JOBS', '2': 'APPLY', '3': 'CONTACT', '4': 'CONTACT', '5': 'AI' },
  }
  const defaultMenuMap: Record<string, string> = { '1': 'CATALOG', '2': 'ORDERS', '3': 'OFFERS', '4': 'CONTACT', '5': 'AI' }
  const activeMap = menuMap[tenant.businessType] || defaultMenuMap
  if (activeMap[upperText]) {
    const mapped = activeMap[upperText]
    if (mapped === 'AI') {
      await send(fromPhone, `🤖 *AI Assistant*\n\nAsk me anything about ${tenant.businessName}!\n\nType *MENU* to go back.`)
      return
    }
    text = mapped
    upperText = mapped
  }

  // ── GLOBAL COMMANDS ──
  if (/^(MENU|HI|HELLO|START|HOME|MAIN MENU)$/.test(upperText)) {
    db.prepare('UPDATE customers SET conversationState = ? WHERE id = ?').run('MENU', customer.id)
    await send(fromPhone, buildMainMenu(tenant, customer.name as string))
    return
  }

  if (/^(AGENT|HUMAN|SUPPORT AGENT|TALK TO HUMAN|SPEAK TO AGENT)$/.test(upperText)) {
    await send(fromPhone,
      `👤 *Connecting you to our team...*\n\n` +
      `📞 ${tenant.phone || 'Call us directly'}\n` +
      `📧 ${tenant.email || ''}\n\n` +
      `_Type *MENU* to use the AI assistant in the meantime._`
    )
    return
  }

  if (upperText === 'CHECKOUT') {
    await handleCheckoutInitiate(tenant, customer, fromPhone, send, tenantId, phoneNumberId)
    return
  }

  // ── BUSINESS FLOW ENGINE ──
  const flowResult = await processBusinessFlow({
    tenant,
    customer,
    phone: fromPhone,
    text,
    upperText,
    send,
    sendImage,
    sendDoc,
    context: convContext,
  })

  if (flowResult.handled) {
    if (flowResult.newState) {
      db.prepare('UPDATE customers SET conversationState = ? WHERE id = ?').run(flowResult.newState, customer.id)
    }
    if (flowResult.updatedContext) {
      const newCtx = { ...convContext, ...flowResult.updatedContext }
      db.prepare('UPDATE customers SET conversationContext = ? WHERE id = ?').run(toJson(newCtx), customer.id)
    }
    return
  }

  // ── AI FALLBACK ──
  if (tenant.settings.aiEnabled) {
    try {
      const aiResult = await generateAiReply(tenant, customer, text)
      await send(fromPhone, aiResult.text)
      if (aiResult.requestsHandoff) {
        await send(fromPhone,
          `👤 Let me connect you with our team for further assistance.\n\n` +
          `📞 ${tenant.phone || ''}\n📧 ${tenant.email || ''}`
        )
      }
    } catch {
      await send(fromPhone, buildMainMenu(tenant, customer.name as string))
    }
  } else {
    await send(fromPhone, buildMainMenu(tenant, customer.name as string))
  }
}

// ─── Checkout Handlers ────────────────────────────────────────────

async function handleCheckoutInitiate(
  tenant: TenantRecord,
  customer: Record<string, unknown>,
  phone: string,
  send: (to: string, msg: string) => Promise<void>,
  tenantId: string,
  _phoneNumberId: string
): Promise<void> {
  const db = getDb()
  const cartItems = db.prepare('SELECT * FROM cart_items WHERE tenantId = ? AND customerId = ?').all(tenantId, customer.id) as Record<string, unknown>[]

  if (cartItems.length === 0) {
    await send(phone, `🛒 Your cart is empty.\n\nType *CATALOG* to browse our products.`)
    return
  }

  let msg = `🛒 *Your Order Summary*\n\n`
  let total = 0
  cartItems.forEach((item, i) => {
    const subtotal = (item.price as number) * (item.quantity as number)
    total += subtotal
    msg += `${i + 1}. *${item.productName}*\n`
    msg += `   ${item.quantity} × ${tenant.currency} ${(item.price as number).toFixed(2)} = ${tenant.currency} ${subtotal.toFixed(2)}\n`
  })
  msg += `\n─────────────────\n💰 *Total: ${tenant.currency} ${total.toFixed(2)}*\n\n`
  msg += `📝 Add a note or type *CONFIRM* to place the order.`

  db.prepare('UPDATE customers SET conversationState = ? WHERE id = ?').run('CHECKOUT', customer.id)
  await send(phone, msg)
}

async function handleCheckoutState(
  tenant: TenantRecord,
  customer: Record<string, unknown>,
  text: string,
  upperText: string,
  phone: string,
  send: (to: string, msg: string) => Promise<void>,
  tenantId: string,
  _phoneNumberId: string
): Promise<void> {
  const db = getDb()

  if (/^(CONFIRM|YES|OK|PLACE ORDER)$/.test(upperText)) {
    const cartItems = db.prepare('SELECT * FROM cart_items WHERE tenantId = ? AND customerId = ?').all(tenantId, customer.id) as Record<string, unknown>[]

    if (cartItems.length === 0) {
      await send(phone, `🛒 Your cart is empty. Type *CATALOG* to browse.`)
      db.prepare('UPDATE customers SET conversationState = ? WHERE id = ?').run('MENU', customer.id)
      return
    }

    let subtotal = 0
    const orderItems = []
    for (const item of cartItems) {
      const sub = (item.price as number) * (item.quantity as number)
      subtotal += sub
      orderItems.push({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
        subtotal: sub,
      })
    }

    const orderId = generateId()
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`
    const now = nowIso()

    db.prepare(`
      INSERT INTO orders (id, tenantId, customerId, orderNumber, type, status, items, subtotal, total, currency, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 'order', 'pending', ?, ?, ?, ?, ?, ?)
    `).run(orderId, tenantId, customer.id, orderNumber, toJson(orderItems), subtotal, subtotal, tenant.currency || 'USD', now, now)

    // Update customer stats
    const currentTags = fromJson<string[]>(customer.tags as string, [])
    if (!currentTags.includes('repeat_buyer')) currentTags.push('repeat_buyer')
    db.prepare(`
      UPDATE customers SET
        totalOrders = totalOrders + 1,
        totalSpent = totalSpent + ?,
        leadScore = leadScore + 20,
        conversationState = 'MENU',
        tags = ?
      WHERE id = ?
    `).run(subtotal, toJson(currentTags), customer.id)

    // Clear cart
    db.prepare('DELETE FROM cart_items WHERE tenantId = ? AND customerId = ?').run(tenantId, customer.id)

    const confirmMsg =
      `✅ *Order Confirmed!*\n\n` +
      `📋 Order Number: *${orderNumber}*\n` +
      `💰 Total: ${tenant.currency} ${subtotal.toFixed(2)}\n\n` +
      `Our team will process your order shortly.\n\n` +
      `Track your order: Type *ORDER ${orderNumber}*\n\n` +
      `Thank you for shopping with *${tenant.businessName}*! 🎉`

    await send(phone, confirmMsg)
    await updateOrderStats(tenantId, subtotal)

  } else if (/^(CANCEL|NO|BACK)$/.test(upperText)) {
    db.prepare('UPDATE customers SET conversationState = ? WHERE id = ?').run('MENU', customer.id)
    await send(phone, `❌ Order cancelled. Your cart is still saved.\n\nType *CART* to review, or *MENU* to go back.`)
  } else {
    // Save as order note
    const ctx = fromJson<Record<string, unknown>>(customer.conversationContext as string, {})
    ctx.orderNote = text
    db.prepare('UPDATE customers SET conversationContext = ? WHERE id = ?').run(toJson(ctx), customer.id)
    await send(phone, `📝 Note saved: "${text}"\n\nType *CONFIRM* to place your order or *CANCEL* to go back.`)
  }
}

// ─── Status Update Handler ────────────────────────────────────────

async function processStatusUpdate(status: Record<string, unknown>): Promise<void> {
  const msgId = status.id as string
  const newStatus = status.status as string

  const statusMap: Record<string, string> = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' }
  if (statusMap[newStatus] && msgId) {
    getDb().prepare('UPDATE messages SET status = ? WHERE metaMessageId = ?').run(statusMap[newStatus], msgId)
  }
}

// ─── Analytics Helpers ────────────────────────────────────────────

async function incrementIncomingStats(tenantId: string): Promise<void> {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  const hour = new Date().getHours()

  const existing = db.prepare('SELECT * FROM analytics WHERE tenantId = ? AND date = ?').get(tenantId, today) as Record<string, unknown> | undefined
  if (!existing) {
    const hourly = new Array(24).fill(0)
    hourly[hour] = 1
    db.prepare(`INSERT INTO analytics (id, tenantId, date, messages, customers, orders, revenue, broadcasts, hourlyMessages) VALUES (?, ?, ?, ?, '{}', '{}', '{}', '{}', ?)`).run(
      generateId(), tenantId, today,
      toJson({ incoming: 1, outgoing: 0, aiGenerated: 0 }),
      toJson(hourly)
    )
  } else {
    const msgs = fromJson<{ incoming?: number }>(existing.messages as string, {})
    msgs.incoming = (msgs.incoming || 0) + 1
    const hourly = fromJson<number[]>(existing.hourlyMessages as string, new Array(24).fill(0))
    hourly[hour] = (hourly[hour] || 0) + 1
    db.prepare('UPDATE analytics SET messages = ?, hourlyMessages = ? WHERE tenantId = ? AND date = ?').run(toJson(msgs), toJson(hourly), tenantId, today)
  }
}

async function incrementOutgoingStats(tenantId: string): Promise<void> {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  const existing = db.prepare('SELECT messages FROM analytics WHERE tenantId = ? AND date = ?').get(tenantId, today) as { messages: string } | undefined
  if (existing) {
    const msgs = fromJson<{ outgoing?: number }>(existing.messages, {})
    msgs.outgoing = (msgs.outgoing || 0) + 1
    db.prepare('UPDATE analytics SET messages = ? WHERE tenantId = ? AND date = ?').run(toJson(msgs), tenantId, today)
  }
}

async function updateOrderStats(tenantId: string, revenue: number): Promise<void> {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  const existing = db.prepare('SELECT orders, revenue FROM analytics WHERE tenantId = ? AND date = ?').get(tenantId, today) as Record<string, string> | undefined
  if (existing) {
    const orders = fromJson<{ created?: number; revenue?: number }>(existing.orders, {})
    orders.created = (orders.created || 0) + 1
    orders.revenue = (orders.revenue || 0) + revenue
    db.prepare('UPDATE analytics SET orders = ? WHERE tenantId = ? AND date = ?').run(toJson(orders), tenantId, today)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function parseTenantFull(row: Record<string, unknown>): TenantRecord {
  const whatsapp = fromJson<TenantRecord['whatsapp']>(row.whatsapp as string, {
    phoneNumberId: '', businessAccountId: '', accessToken: '', webhookVerifyToken: '', displayName: '', isVerified: false,
  })
  const subscription = fromJson<TenantRecord['subscription']>(row.subscription as string, {
    plan: 'trial', status: 'active', messagesUsedThisMonth: 0, messagesResetAt: '',
  })
  const settings = fromJson<Record<string, unknown>>(row.settings as string, {})

  return {
    ...(row as unknown as TenantRecord),
    _id: row.id as string,
    id: row.id as string,
    isActive: Boolean(row.isActive),
    whatsapp,
    subscription,
    settings,
    teamMembers: fromJson(row.teamMembers as string, []),
  }
}

function buildMainMenu(tenant: TenantRecord, name?: string | null): string {
  const greeting = name ? `👋 Hello, *${name}*!` : `👋 Hello!`

  const menuByType: Record<string, string> = {
    hotel: `*1️⃣* 🛏️ Room Availability\n*2️⃣* 📅 Book a Room\n*3️⃣* 🏊 Amenities\n*4️⃣* 📍 Location & Contact\n*5️⃣* 🤖 Ask AI Assistant`,
    restaurant: `*1️⃣* 🍽️ View Menu\n*2️⃣* 🍱 Place Order\n*3️⃣* 🪑 Book a Table\n*4️⃣* 🔥 Today's Specials\n*5️⃣* 🤖 Ask a Question`,
    grocery: `*1️⃣* 🛒 Browse Products\n*2️⃣* 🔥 Today's Deals\n*3️⃣* 📦 Order Groceries\n*4️⃣* 🚚 Track Delivery\n*5️⃣* 🤖 AI Assistant`,
    real_estate: `*1️⃣* 🏠 View Properties\n*2️⃣* 🗓️ Schedule Site Visit\n*3️⃣* 💰 Check Pricing\n*4️⃣* 📄 Get Brochure\n*5️⃣* 🤖 Ask Our Expert`,
    clinic: `*1️⃣* 🩺 Our Services\n*2️⃣* 📅 Book Appointment\n*3️⃣* 💰 Consultation Fees\n*4️⃣* ⏰ Timings & Location\n*5️⃣* 🤖 Health Assistant`,
    salon: `*1️⃣* 💅 Our Services\n*2️⃣* 📅 Book Appointment\n*3️⃣* 💰 Pricing\n*4️⃣* ⏰ Opening Hours\n*5️⃣* 🤖 Ask Us Anything`,
    agency_travel: `*1️⃣* ✈️ Travel Packages\n*2️⃣* 📅 Book a Trip\n*3️⃣* 💰 Get a Quote\n*4️⃣* 📋 Our Services\n*5️⃣* 🤖 Travel Assistant`,
    agency_recruitment: `*1️⃣* 💼 View Job Openings\n*2️⃣* 📋 Apply for a Job\n*3️⃣* 🏢 For Employers\n*4️⃣* 📞 Contact Us\n*5️⃣* 🤖 HR Assistant`,
  }

  const defaultMenu = `*1️⃣* 🛍️ Browse Catalog\n*2️⃣* 📋 My Orders\n*3️⃣* 🔥 Offers & Deals\n*4️⃣* 📞 Contact Us\n*5️⃣* 🤖 AI Assistant`
  const menuOptions = menuByType[tenant.businessType] || defaultMenu

  return `${greeting}\n\nWelcome to *${tenant.businessName}*!\n\n${menuOptions}\n\n_Reply with a number or type your question!_`
}

function validateSignature(req: Request): boolean {
  const signature = req.headers['x-hub-signature-256'] as string
  if (!signature) return false
  const expectedSig = `sha256=${crypto.createHmac('sha256', config.meta.appSecret).update(JSON.stringify(req.body)).digest('hex')}`
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
}
