import { Request, Response } from 'express'
import { getDb, parseCustomer, parseOrder, generateId, nowIso, toJson, fromJson } from '../database/sqlite'

export async function getCustomers(req: Request, res: Response): Promise<void> {
  const { page = 1, limit = 20, tag, search, optIn, segment, sortBy = 'lastMessageAt', order = 'desc' } = req.query
  const db = getDb()

  const conditions: string[] = ['tenantId = ?']
  const params: unknown[] = [req.tenantId]

  if (segment) { conditions.push('segment = ?'); params.push(segment) }
  if (optIn !== undefined) { conditions.push('optIn = ?'); params.push(optIn === 'true' ? 1 : 0) }
  if (search) {
    conditions.push('(name LIKE ? OR phone LIKE ? OR email LIKE ?)')
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }

  const where = conditions.join(' AND ')
  const allowedSort = ['lastMessageAt', 'firstSeenAt', 'totalSpent', 'totalOrders', 'leadScore', 'name']
  const sortCol = allowedSort.includes(sortBy as string) ? sortBy : 'lastMessageAt'
  const sortDir = order === 'asc' ? 'ASC' : 'DESC'

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM customers WHERE ${where}`).get(...params) as { cnt: number }).cnt
  const offset = (Number(page) - 1) * Number(limit)
  const rows = db.prepare(`SELECT * FROM customers WHERE ${where} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`).all(...params, Number(limit), offset) as Record<string, unknown>[]

  // Filter by tag (JSON array) after fetching
  let customers = rows.map(r => parseCustomer(r)!)
  if (tag) {
    customers = customers.filter(c => Array.isArray(c.tags) && (c.tags as string[]).includes(tag as string))
  }

  res.json({
    success: true,
    data: customers,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  })
}

export async function getCustomer(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const row = db.prepare('SELECT * FROM customers WHERE id = ? AND tenantId = ?').get(req.params.id, req.tenantId) as Record<string, unknown> | undefined
  if (!row) {
    res.status(404).json({ success: false, message: 'Customer not found' })
    return
  }

  const customer = parseCustomer(row)!
  const messages = db.prepare('SELECT * FROM messages WHERE tenantId = ? AND customerId = ? ORDER BY createdAt DESC LIMIT 50').all(req.tenantId, customer.id) as Record<string, unknown>[]
  const orders = db.prepare('SELECT * FROM orders WHERE tenantId = ? AND customerId = ? ORDER BY createdAt DESC LIMIT 10').all(req.tenantId, customer.id) as Record<string, unknown>[]

  res.json({
    success: true,
    data: {
      customer,
      messages,
      orders: orders.map(o => parseOrder(o)!),
    },
  })
}

export async function updateCustomer(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const allowed = ['name', 'email', 'notes', 'tags', 'segment', 'leadScore', 'customFields']
  const sets: string[] = []
  const values: unknown[] = []

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      if (key === 'tags' || key === 'customFields') {
        sets.push(`${key} = ?`)
        values.push(toJson(req.body[key]))
      } else {
        sets.push(`${key} = ?`)
        values.push(req.body[key])
      }
    }
  }

  if (sets.length === 0) {
    res.status(400).json({ success: false, message: 'No valid fields to update' })
    return
  }

  values.push(req.params.id, req.tenantId)
  const result = db.prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = ? AND tenantId = ?`).run(...values)

  if (result.changes === 0) {
    res.status(404).json({ success: false, message: 'Customer not found' })
    return
  }

  const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json({ success: true, data: parseCustomer(updated) })
}

export async function blockCustomer(req: Request, res: Response): Promise<void> {
  const { reason } = req.body
  const db = getDb()
  const result = db.prepare(`
    UPDATE customers SET isBlocked = 1, blacklistedReason = ?, optIn = 0, optOutAt = ? WHERE id = ? AND tenantId = ?
  `).run(reason || null, nowIso(), req.params.id, req.tenantId)

  if (result.changes === 0) {
    res.status(404).json({ success: false, message: 'Customer not found' })
    return
  }
  const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json({ success: true, message: 'Customer blocked', data: parseCustomer(updated) })
}

export async function unblockCustomer(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const result = db.prepare('UPDATE customers SET isBlocked = 0, blacklistedReason = NULL WHERE id = ? AND tenantId = ?').run(req.params.id, req.tenantId)
  if (result.changes === 0) {
    res.status(404).json({ success: false, message: 'Customer not found' })
    return
  }
  const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json({ success: true, message: 'Customer unblocked', data: parseCustomer(updated) })
}

export async function getCustomerStats(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const tenantId = req.tenantId
  const todayStart = new Date(); todayStart.setHours(0,0,0,0)

  const total = (db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE tenantId = ?').get(tenantId) as { cnt: number }).cnt
  const newToday = (db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE tenantId = ? AND firstSeenAt >= ?').get(tenantId, todayStart.toISOString()) as { cnt: number }).cnt
  const optedOut = (db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE tenantId = ? AND optIn = 0').get(tenantId) as { cnt: number }).cnt

  res.json({
    success: true,
    data: {
      total,
      newToday,
      optedOut,
      active: total - optedOut,
      tagDistribution: [],
    },
  })
}

export async function sendDirectMessage(req: Request, res: Response): Promise<void> {
  const { message } = req.body
  const db = getDb()

  const customerRow = db.prepare('SELECT * FROM customers WHERE id = ? AND tenantId = ?').get(req.params.id, req.tenantId) as Record<string, unknown> | undefined
  if (!customerRow) {
    res.status(404).json({ success: false, message: 'Customer not found' })
    return
  }
  const customer = parseCustomer(customerRow)!

  const tenantRow = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenantId) as Record<string, unknown>
  const whatsapp = fromJson<{ phoneNumberId: string; accessToken: string }>(tenantRow.whatsapp as string, { phoneNumberId: '', accessToken: '' })

  const { sendText } = await import('../services/whatsapp.service')
  const result = await sendText({
    phoneNumberId: whatsapp.phoneNumberId,
    accessToken: whatsapp.accessToken,
    to: customer.phone as string,
    text: message,
  })

  if (result.success) {
    db.prepare(`
      INSERT INTO messages (id, tenantId, customerId, role, type, content, status, createdAt)
      VALUES (?, ?, ?, 'assistant', 'text', ?, 'sent', ?)
    `).run(generateId(), req.tenantId, customer.id as string, message, nowIso())
    res.json({ success: true, messageId: result.messageId })
  } else {
    // Parse Meta error for clear logging
    let errorDetail = result.error || 'unknown'
    try {
      const parsed = JSON.parse(result.error || '{}')
      if (parsed?.error?.message) {
        errorDetail = `${parsed.error.message} (code: ${parsed.error.code})`
        if (parsed.error.code === 190) errorDetail += ' — TOKEN EXPIRED: run node update-token.js <NEW_TOKEN>'
      }
    } catch {}
    console.error(`[sendDirectMessage] FAILED to ${customer.phone}: ${errorDetail}`)
    res.status(500).json({ success: false, message: 'Failed to send message', error: result.error })
  }
}
