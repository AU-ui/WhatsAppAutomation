/**
 * Broadcast Manager — Bulk messaging, scheduled campaigns, festival greetings
 *
 * Features:
 *  - Immediate bulk message to all / tagged customers
 *  - Scheduled broadcasts (cron-style, stored in DB)
 *  - Pre-built festival templates (Diwali, Eid, Christmas, New Year…)
 *  - New product / new offer auto-notification
 *  - Low stock alert to admin
 *  - Opt-out / GDPR support
 */

import { getDb } from '../../database/db'
import { config } from '../../config'
import { logger } from '../../utils/logger'
import { getSocket } from '../../whatsapp/client'

// ─── Types ────────────────────────────────────────────────────────

export type BroadcastStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled'
export type CustomerTag = 'VIP' | 'New' | 'Frequent' | 'Subscriber' | 'All'

export interface Broadcast {
  id: number
  name: string
  message: string
  target_tags: string         // JSON array of CustomerTag
  status: BroadcastStatus
  scheduled_at: number | null // unix ms, null = immediate
  sent_at: number | null
  sent_count: number
  failed_count: number
  created_at: number
}

// ─── Schema (called once at startup) ──────────────────────────────

export function initBroadcastSchema(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS broadcasts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      message      TEXT NOT NULL,
      target_tags  TEXT DEFAULT '["All"]',
      status       TEXT DEFAULT 'draft',
      scheduled_at INTEGER,
      sent_at      INTEGER,
      sent_count   INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      created_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS opt_outs (
      customer_id INTEGER PRIMARY KEY,
      opted_out_at INTEGER NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `)
}

// ─── Opt-out / Opt-in ─────────────────────────────────────────────

export function optOut(customerId: number): void {
  getDb().prepare(
    `INSERT OR IGNORE INTO opt_outs (customer_id, opted_out_at) VALUES (?, ?)`
  ).run(customerId, Date.now())
  logger.info({ customerId }, 'Customer opted out of broadcasts')
}

export function optIn(customerId: number): void {
  getDb().prepare(`DELETE FROM opt_outs WHERE customer_id = ?`).run(customerId)
  logger.info({ customerId }, 'Customer opted back in')
}

export function isOptedOut(customerId: number): boolean {
  const row = getDb().prepare(`SELECT 1 FROM opt_outs WHERE customer_id = ?`).get(customerId)
  return !!row
}

// ─── Broadcast CRUD ───────────────────────────────────────────────

export function createBroadcast(data: {
  name: string
  message: string
  target_tags?: CustomerTag[]
  scheduled_at?: number | null
}): Broadcast {
  const db = getDb()
  const result = db.prepare(`
    INSERT INTO broadcasts (name, message, target_tags, status, scheduled_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    data.name,
    data.message,
    JSON.stringify(data.target_tags || ['All']),
    data.scheduled_at ? 'scheduled' : 'draft',
    data.scheduled_at || null,
    Date.now(),
  )
  return getBroadcast(result.lastInsertRowid as number)!
}

export function getBroadcast(id: number): Broadcast | undefined {
  return getDb().prepare(`SELECT * FROM broadcasts WHERE id = ?`).get(id) as Broadcast | undefined
}

export function listBroadcasts(status?: string): Broadcast[] {
  if (status) {
    return getDb().prepare(`SELECT * FROM broadcasts WHERE status = ? ORDER BY created_at DESC`).all(status) as Broadcast[]
  }
  return getDb().prepare(`SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 100`).all() as Broadcast[]
}

export function updateBroadcast(id: number, data: Partial<Pick<Broadcast, 'name' | 'message' | 'target_tags' | 'scheduled_at' | 'status'>>): void {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
  const values = [...Object.values(data), id]
  getDb().prepare(`UPDATE broadcasts SET ${fields} WHERE id = ?`).run(...values)
}

export function cancelBroadcast(id: number): void {
  getDb().prepare(`UPDATE broadcasts SET status = 'cancelled' WHERE id = ? AND status IN ('draft','scheduled')`).run(id)
}

// ─── Get recipients for a broadcast ──────────────────────────────

function getRecipients(targetTags: CustomerTag[]): { id: number; phone: string; name: string | null }[] {
  const db = getDb()

  // Exclude opted-out customers
  const baseQuery = `
    SELECT c.id, c.phone, c.name FROM customers c
    LEFT JOIN opt_outs o ON o.customer_id = c.id
    WHERE c.is_blocked = 0 AND o.customer_id IS NULL
  `

  if (targetTags.includes('All')) {
    return db.prepare(baseQuery).all() as { id: number; phone: string; name: string | null }[]
  }

  // Tag-based filtering (tags stored as JSON array on customer)
  const tagFilters = targetTags.map(tag => `JSON_EACH.value = '${tag}'`).join(' OR ')
  return db.prepare(`
    ${baseQuery}
    AND EXISTS (
      SELECT 1 FROM json_each(c.tags) AS JSON_EACH WHERE ${tagFilters}
    )
  `).all() as { id: number; phone: string; name: string | null }[]
}

// ─── Send a broadcast NOW ─────────────────────────────────────────

export async function sendBroadcast(broadcastId: number): Promise<{ sent: number; failed: number }> {
  const db = getDb()
  const broadcast = getBroadcast(broadcastId)
  if (!broadcast) throw new Error(`Broadcast ${broadcastId} not found`)
  if (broadcast.status === 'sending') throw new Error('Broadcast already sending')
  if (broadcast.status === 'sent') throw new Error('Broadcast already sent')

  const sock = getSocket()
  if (!sock) throw new Error('WhatsApp not connected')

  db.prepare(`UPDATE broadcasts SET status = 'sending' WHERE id = ?`).run(broadcastId)

  const tags = JSON.parse(broadcast.target_tags) as CustomerTag[]
  const recipients = getRecipients(tags)

  logger.info({ broadcastId, count: recipients.length }, 'Starting broadcast')

  let sent = 0
  let failed = 0

  for (const customer of recipients) {
    try {
      const personalised = broadcast.message.replace('{name}', customer.name || 'Valued Customer')
      await sock.sendMessage(customer.phone, { text: personalised })

      // Anti-spam: 1-2s delay between messages
      await delay(1000 + Math.random() * 1000)
      sent++
    } catch (err) {
      logger.warn({ err, phone: customer.phone }, 'Failed to send broadcast message')
      failed++
    }
  }

  db.prepare(`
    UPDATE broadcasts SET status = 'sent', sent_at = ?, sent_count = ?, failed_count = ?
    WHERE id = ?
  `).run(Date.now(), sent, failed, broadcastId)

  logger.info({ broadcastId, sent, failed }, 'Broadcast complete')
  return { sent, failed }
}

// ─── Scheduled Broadcast Runner ───────────────────────────────────
// Called every minute from the main process

export async function runScheduledBroadcasts(): Promise<void> {
  const now = Date.now()
  const due = getDb().prepare(`
    SELECT * FROM broadcasts
    WHERE status = 'scheduled' AND scheduled_at <= ?
  `).all(now) as Broadcast[]

  for (const b of due) {
    logger.info({ id: b.id, name: b.name }, 'Running scheduled broadcast')
    try {
      await sendBroadcast(b.id)
    } catch (err) {
      logger.error({ err, broadcastId: b.id }, 'Scheduled broadcast failed')
    }
  }
}

// ─── Festival Templates ───────────────────────────────────────────

export const FESTIVAL_TEMPLATES: Record<string, string> = {
  diwali: `🪔 *Happy Diwali from ${config.business.name}!*\n\nWishing you and your family a sparkling Diwali filled with joy and prosperity! ✨\n\nAs our way of celebrating, enjoy *20% OFF* on all orders today!\nUse code: *DIWALI20*\n\n🛍️ Shop now: ${config.business.website || 'Reply CATALOG'}`,
  eid: `🌙 *Eid Mubarak from ${config.business.name}!*\n\nWarm wishes to you and your family on this blessed occasion. 🌟\n\nCelebrate with our *Special Eid Collection* — up to *25% OFF*!\n\n🛍️ Reply *CATALOG* to browse or visit ${config.business.website || 'our store'}`,
  christmas: `🎄 *Merry Christmas from ${config.business.name}!*\n\nSeason's Greetings! Wishing you joy, peace, and happiness. 🎁\n\nTreat yourself to our *Christmas Sale — 15% OFF* all items!\n\n🛍️ Type *CATALOG* to see all products`,
  new_year: `🎆 *Happy New Year from ${config.business.name}!*\n\nWelcome ${new Date().getFullYear() + 1} with amazing deals! 🥳\n\nStart the year right with *10% OFF* your next order.\nCode: *NY${new Date().getFullYear() + 1}*\n\n🛍️ Browse our catalog — just type *CATALOG*`,
  weekend_offer: `🎉 *Weekend Special from ${config.business.name}!*\n\nHey {name}! 👋 This weekend only — exclusive deals just for you!\n\n✅ Free delivery on orders above ${config.business.currency} 50\n✅ Up to 30% off select items\n\nType *CATALOG* to shop now! Limited time only ⏰`,
  new_product: `🆕 *New Arrivals at ${config.business.name}!*\n\nHey {name}, we just added exciting new products to our collection! 🛍️\n\nBe among the first to grab them before they sell out!\n\n👉 Type *CATALOG* to browse all products\n\n_Reply STOP to unsubscribe from notifications._`,
  flash_sale: `⚡ *FLASH SALE — ${config.business.name}!*\n\nHurry, {name}! This offer expires in 24 hours! ⏱️\n\n🔥 Up to *40% OFF* on selected items\n🚀 FREE delivery on all orders TODAY ONLY\n\nType *CATALOG* to shop now!\n\n_Reply STOP to opt out._`,
}

export function getFestivalTemplate(key: string): string | null {
  return FESTIVAL_TEMPLATES[key] || null
}

// ─── Auto-notifications ───────────────────────────────────────────

/** Called after a new product is added — notify subscribed customers */
export async function notifyNewProduct(productName: string, productDesc: string): Promise<void> {
  const message = FESTIVAL_TEMPLATES.new_product
    .replace('{product}', productName)
    .replace('{desc}', productDesc)

  const broadcast = createBroadcast({
    name: `New Product: ${productName}`,
    message,
    target_tags: ['Subscriber', 'VIP', 'Frequent'],
  })

  await sendBroadcast(broadcast.id)
}

/** Low-stock alert to admin phone */
export async function checkLowStock(adminPhone: string): Promise<void> {
  const sock = getSocket()
  if (!sock) return

  const lowStock = getDb().prepare(`
    SELECT name, stock FROM products WHERE active = 1 AND stock >= 0 AND stock <= 5
    ORDER BY stock ASC LIMIT 20
  `).all() as { name: string; stock: number }[]

  if (lowStock.length === 0) return

  let msg = `⚠️ *Low Stock Alert — ${config.business.name}*\n\nThe following products are running low:\n\n`
  for (const p of lowStock) {
    msg += `• ${p.name}: *${p.stock} left*\n`
  }
  msg += `\nPlease restock soon to avoid missed orders.`

  const jid = adminPhone.includes('@') ? adminPhone : `${adminPhone}@s.whatsapp.net`
  await sock.sendMessage(jid, { text: msg })
  logger.info({ count: lowStock.length }, 'Low stock alert sent to admin')
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

// ─── Auto Triggers (runs every hour from scheduler) ───────────────

/**
 * Fully automatic: checks time-based conditions and fires broadcasts
 * with ZERO human involvement needed.
 */
export async function runAutoTriggers(): Promise<void> {
  await triggerReEngagement()
  await triggerFestivalGreeting()
  await triggerVIPUpgrade()
}

/** Customers silent for 7 days → automatic re-engagement offer */
async function triggerReEngagement(): Promise<void> {
  const db = getDb()
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const oneDayAgo   = Date.now() - 24 * 60 * 60 * 1000

  // Only fire once per customer (check sent_at on a flag in bot_config keyed by customer)
  const inactive = db.prepare(`
    SELECT c.id, c.phone, c.name FROM customers c
    LEFT JOIN opt_outs o ON o.customer_id = c.id
    JOIN conversations cv ON cv.customer_id = c.id
    WHERE c.is_blocked = 0 AND o.customer_id IS NULL
      AND cv.last_message_at < ? AND cv.last_message_at > ?
      AND c.name IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM bot_config
        WHERE key = 're_engage_sent_' || c.id AND CAST(value AS INTEGER) > ?
      )
  `).all(sevenDaysAgo, sevenDaysAgo - 7 * 24 * 60 * 60 * 1000, oneDayAgo) as { id: number; phone: string; name: string }[]

  if (inactive.length === 0) return

  const sock = getSocket()
  if (!sock) return

  for (const c of inactive) {
    const msg = `Hey *${c.name}* 👋\n\nWe miss you at *${config.business.name}*!\n\n` +
      `It's been a while — come back and check our latest products!\n\n` +
      `🎁 *Special return offer: 15% OFF* your next order.\n\n` +
      `Type *CATALOG* to browse or *MENU* to get started.\n\n` +
      `_Reply STOP to unsubscribe._`
    try {
      await sock.sendMessage(c.phone, { text: msg })
      // Mark as sent so we don't re-send
      db.prepare(`INSERT OR REPLACE INTO bot_config (key, value) VALUES (?, ?)`)
        .run(`re_engage_sent_${c.id}`, String(Date.now()))
      await delay(1500)
    } catch { /* skip failed */ }
  }
  logger.info({ count: inactive.length }, 'Auto re-engagement offers sent')
}

/** Detects nearby festivals and auto-fires the matching template */
async function triggerFestivalGreeting(): Promise<void> {
  const db = getDb()
  const now  = new Date()
  const month = now.getMonth() + 1 // 1-12
  const day   = now.getDate()

  // Festival calendar: { month, dayFrom, dayTo, template }
  const calendar = [
    { month: 10, dayFrom: 20, dayTo: 25, template: 'diwali' },
    { month: 12, dayFrom: 22, dayTo: 26, template: 'christmas' },
    { month: 1,  dayFrom: 1,  dayTo: 2,  template: 'new_year' },
  ]

  const festival = calendar.find(f =>
    f.month === month && day >= f.dayFrom && day <= f.dayTo
  )
  if (!festival) return

  // Check if already sent today
  const key = `festival_sent_${festival.template}_${now.toISOString().slice(0, 10)}`
  const alreadySent = db.prepare(`SELECT 1 FROM bot_config WHERE key = ?`).get(key)
  if (alreadySent) return

  const message = FESTIVAL_TEMPLATES[festival.template]
  if (!message) return

  const bc = createBroadcast({
    name: `Auto: ${festival.template} ${now.getFullYear()}`,
    message,
    target_tags: ['All'],
  })
  await sendBroadcast(bc.id)

  db.prepare(`INSERT OR REPLACE INTO bot_config (key, value) VALUES (?, ?)`)
    .run(key, 'sent')

  logger.info({ festival: festival.template }, 'Auto festival broadcast sent')
}

/** Customers whose score crossed VIP threshold → auto-send VIP welcome */
async function triggerVIPUpgrade(): Promise<void> {
  const db = getDb()
  const sock = getSocket()
  if (!sock) return

  const newVIPs = db.prepare(`
    SELECT c.id, c.phone, c.name FROM customers c
    WHERE c.lead_score >= 60 AND c.name IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM bot_config WHERE key = 'vip_welcome_' || c.id
      )
  `).all() as { id: number; phone: string; name: string }[]

  for (const c of newVIPs) {
    const msg =
      `⭐ *You're now a VIP at ${config.business.name}!*\n\n` +
      `Thank you, *${c.name}*, for your continued loyalty! 🙏\n\n` +
      `As a VIP member you now enjoy:\n` +
      `✅ Priority support\n✅ Exclusive early offers\n✅ Special discounts\n\n` +
      `Stay tuned for your next exclusive deal! 🎁`
    try {
      await sock.sendMessage(c.phone, { text: msg })
      db.prepare(`INSERT OR REPLACE INTO bot_config (key, value) VALUES (?, ?)`)
        .run(`vip_welcome_${c.id}`, 'sent')
      db.prepare(`UPDATE customers SET tags = ? WHERE id = ?`)
        .run(JSON.stringify(['VIP']), c.id)
      await delay(1500)
    } catch { /* skip */ }
  }
  if (newVIPs.length > 0) logger.info({ count: newVIPs.length }, 'Auto VIP welcome messages sent')
}
