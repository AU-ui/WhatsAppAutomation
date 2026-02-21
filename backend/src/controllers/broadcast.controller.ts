import { Request, Response } from 'express'
import { getDb, generateId, nowIso, toJson, parseBroadcast } from '../database/sqlite'
import { executeBroadcast } from '../services/broadcast.service'
import { logger } from '../utils/logger'

export async function getBroadcasts(req: Request, res: Response): Promise<void> {
  const { page = 1, limit = 20, status, type } = req.query
  const db = getDb()

  const conditions: string[] = ['tenantId = ?']
  const params: unknown[] = [req.tenantId]
  if (status) { conditions.push('status = ?'); params.push(status) }
  if (type) { conditions.push('type = ?'); params.push(type) }

  const where = conditions.join(' AND ')
  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM broadcasts WHERE ${where}`).get(...params) as { cnt: number }).cnt
  const offset = (Number(page) - 1) * Number(limit)
  const rows = db.prepare(`SELECT id, tenantId, name, type, status, messageType, textContent, mediaUrl, mediaCaption, templateName, audience, stats, sendRate, scheduledAt, startedAt, completedAt, isAutoTriggered, triggerEvent, createdAt, updatedAt FROM broadcasts WHERE ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`).all(...params, Number(limit), offset) as Record<string, unknown>[]

  res.json({
    success: true,
    data: rows.map(r => parseBroadcast(r)!),
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  })
}

export async function getBroadcast(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const row = db.prepare('SELECT * FROM broadcasts WHERE id = ? AND tenantId = ?').get(req.params.id, req.tenantId) as Record<string, unknown> | undefined
  if (!row) { res.status(404).json({ success: false, message: 'Broadcast not found' }); return }
  res.json({ success: true, data: parseBroadcast(row) })
}

export async function createBroadcast(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const id = generateId()
  const now = nowIso()
  const {
    name, type, messageType, textContent, mediaUrl, mediaCaption,
    templateName, templateVariables, audience, sendRate, scheduledAt,
  } = req.body

  db.prepare(`
    INSERT INTO broadcasts (id, tenantId, name, type, status, messageType, textContent, mediaUrl, mediaCaption, templateName, templateVariables, audience, recipients, stats, sendRate, scheduledAt, isAutoTriggered, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, 0, ?, ?)
  `).run(
    id, req.tenantId, name, type || 'custom', messageType || 'text',
    textContent || null, mediaUrl || null, mediaCaption || null,
    templateName || null, toJson(templateVariables || {}),
    toJson(audience || {}),
    toJson({ totalRecipients: 0, sent: 0, failed: 0, delivered: 0, read: 0 }),
    sendRate || 1, scheduledAt || null, now, now
  )

  const row = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id) as Record<string, unknown>
  res.status(201).json({ success: true, data: parseBroadcast(row) })
}

export async function updateBroadcast(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const row = db.prepare('SELECT status FROM broadcasts WHERE id = ? AND tenantId = ?').get(req.params.id, req.tenantId) as { status: string } | undefined
  if (!row) { res.status(404).json({ success: false, message: 'Broadcast not found' }); return }
  if (['running', 'completed'].includes(row.status)) {
    res.status(400).json({ success: false, message: 'Cannot edit a running or completed broadcast' }); return
  }

  const allowed = ['name', 'type', 'messageType', 'textContent', 'mediaUrl', 'mediaCaption', 'templateName', 'sendRate', 'scheduledAt']
  const jsonFields = ['templateVariables', 'audience']
  const sets: string[] = ['updatedAt = ?']
  const values: unknown[] = [nowIso()]

  for (const key of allowed) {
    if (req.body[key] !== undefined) { sets.push(`${key} = ?`); values.push(req.body[key]) }
  }
  for (const key of jsonFields) {
    if (req.body[key] !== undefined) { sets.push(`${key} = ?`); values.push(toJson(req.body[key])) }
  }

  values.push(req.params.id, req.tenantId)
  db.prepare(`UPDATE broadcasts SET ${sets.join(', ')} WHERE id = ? AND tenantId = ?`).run(...values)
  const updated = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json({ success: true, data: parseBroadcast(updated) })
}

export async function scheduleBroadcast(req: Request, res: Response): Promise<void> {
  const { scheduledAt } = req.body
  const db = getDb()
  const result = db.prepare(`
    UPDATE broadcasts SET status = 'scheduled', scheduledAt = ?, updatedAt = ?
    WHERE id = ? AND tenantId = ? AND status = 'draft'
  `).run(scheduledAt, nowIso(), req.params.id, req.tenantId)

  if (result.changes === 0) {
    res.status(400).json({ success: false, message: 'Broadcast not found or already scheduled' }); return
  }
  const row = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json({ success: true, data: parseBroadcast(row), message: `Broadcast scheduled for ${scheduledAt}` })
}

export async function sendBroadcastNow(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const row = db.prepare('SELECT id, status FROM broadcasts WHERE id = ? AND tenantId = ?').get(req.params.id, req.tenantId) as { id: string; status: string } | undefined
  if (!row) { res.status(404).json({ success: false, message: 'Broadcast not found' }); return }
  if (row.status === 'running') { res.status(400).json({ success: false, message: 'Broadcast is already running' }); return }

  db.prepare(`UPDATE broadcasts SET status = 'scheduled', scheduledAt = ?, updatedAt = ? WHERE id = ?`).run(nowIso(), nowIso(), row.id)

  executeBroadcast(row.id).catch((err) =>
    logger.error({ err, broadcastId: row.id }, 'Broadcast execution error')
  )

  res.json({ success: true, message: 'Broadcast started', broadcastId: row.id })
}

export async function cancelBroadcast(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const result = db.prepare(`
    UPDATE broadcasts SET status = 'cancelled', updatedAt = ?
    WHERE id = ? AND tenantId = ? AND status IN ('draft', 'scheduled')
  `).run(nowIso(), req.params.id, req.tenantId)

  if (result.changes === 0) {
    res.status(400).json({ success: false, message: 'Cannot cancel broadcast in current state' }); return
  }
  res.json({ success: true, message: 'Broadcast cancelled' })
}

export async function getBroadcastStats(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const row = db.prepare('SELECT stats FROM broadcasts WHERE id = ? AND tenantId = ?').get(req.params.id, req.tenantId) as { stats: string } | undefined
  if (!row) { res.status(404).json({ success: false, message: 'Broadcast not found' }); return }
  const stats = JSON.parse(row.stats || '{}')
  res.json({ success: true, data: stats })
}

export async function estimateAudience(req: Request, res: Response): Promise<void> {
  const { audience } = req.body
  const db = getDb()

  const conditions: string[] = ['tenantId = ?', 'isBlocked = 0']
  const params: unknown[] = [req.tenantId]

  if (audience.optInOnly) { conditions.push('optIn = 1') }
  if (audience.type === 'segment' && audience.segment) { conditions.push('segment = ?'); params.push(audience.segment) }
  if (audience.type === 'custom_list' && audience.customPhones?.length) {
    conditions.push(`phone IN (${audience.customPhones.map(() => '?').join(',')})`)
    params.push(...audience.customPhones)
  }

  let rows = db.prepare(`SELECT id, tags FROM customers WHERE ${conditions.join(' AND ')}`).all(...params) as { id: string; tags: string }[]

  if (audience.type === 'tags' && audience.tags?.length) {
    rows = rows.filter(r => {
      const tags = JSON.parse(r.tags || '[]') as string[]
      return audience.tags.some((t: string) => tags.includes(t))
    })
  }

  res.json({ success: true, estimatedCount: rows.length })
}

export async function getTemplates(_req: Request, res: Response): Promise<void> {
  const templates = [
    { id: 'welcome', name: 'Welcome Message', type: 'onboarding', content: `👋 Welcome to *{{business}}*!\n\nWe're thrilled to have you with us. 🎉\n\nType *MENU* to get started.` },
    { id: 'festival_generic', name: 'Festival Greeting', type: 'festival', content: `🎉 *Happy {{festival}}* from *{{business}}*!\n\n🎁 Type *OFFERS* for festive discounts!\n\n_Reply STOP to unsubscribe_` },
    { id: 'flash_sale', name: 'Flash Sale Alert', type: 'flash_sale', content: `⚡ *FLASH SALE!* ⚡\n\nHi {{name}}! 🛍️ *Up to {{discount}}% OFF* at *{{business}}*!\n\nType *OFFERS* to see all deals.\n\n_Reply STOP to unsubscribe_` },
    { id: 'new_product', name: 'New Product Launch', type: 'new_product', content: `🆕 *New at {{business}}!*\n\n*{{product_name}}* — {{currency}} {{price}}\n\nType *CATALOG* to order now.\n\n_Reply STOP to unsubscribe_` },
    { id: 'abandoned_cart', name: 'Abandoned Cart Reminder', type: 'abandoned_cart', content: `🛒 Hi *{{name}}*! Your cart is waiting at *{{business}}*.\n\nType *CART* to see your items.\n\n_Reply STOP to unsubscribe_` },
    { id: 'order_confirmation', name: 'Order Confirmation', type: 'utility', content: `✅ *Order Confirmed — {{business}}!*\n\n📋 Order #: *{{order_number}}*\n💰 Total: {{currency}} {{total}}\n\nThank you! 🎉` },
    { id: 'feedback_request', name: 'Feedback Request', type: 'utility', content: `⭐ *How was your experience at {{business}}?*\n\nRate us:\n*5* — Excellent 😍\n*4* — Great 😊\n*3* — Good 🙂\n*2* — Fair 😐\n*1* — Poor 😞` },
    { id: 're_engagement', name: 'Re-engagement Campaign', type: 're_engagement', content: `👋 Hi *{{name}}*, we miss you at *{{business}}*!\n\n🔥 Get {{discount}}% off your next purchase!\n\nType *MENU* to explore.\n\n_Reply STOP to unsubscribe_` },
    { id: 'appointment_reminder', name: 'Appointment Reminder', type: 'reminder', content: `⏰ *Reminder — {{business}}*\n\nHi {{name}}!\n📅 *{{date}}* at 🕐 *{{time}}*\n📍 {{address}}\n\nSee you soon! 😊` },
  ]
  res.json({ success: true, data: templates })
}
