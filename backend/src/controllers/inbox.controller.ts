import { Request, Response } from 'express'
import { getDb, parseCustomer, generateId, nowIso, fromJson } from '../database/sqlite'

/** GET /api/inbox – list all conversations (customers with at least one message) */
export async function getConversations(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const { search } = req.query

  let query = `
    SELECT c.*,
      m.content  AS lastMessageContent,
      m.role     AS lastMessageRole,
      m.type     AS lastMessageType,
      m.createdAt AS lastMessageTime,
      (SELECT COUNT(*) FROM messages
        WHERE tenantId = ? AND customerId = c.id AND role = 'user'
      ) AS incomingTotal
    FROM customers c
    LEFT JOIN messages m ON m.id = (
      SELECT id FROM messages
      WHERE tenantId = ? AND customerId = c.id
      ORDER BY createdAt DESC LIMIT 1
    )
    WHERE c.tenantId = ?
      AND EXISTS (SELECT 1 FROM messages WHERE tenantId = ? AND customerId = c.id)
  `
  const params: unknown[] = [req.tenantId, req.tenantId, req.tenantId, req.tenantId]

  if (search) {
    query += ` AND (c.name LIKE ? OR c.phone LIKE ?)`
    params.push(`%${search}%`, `%${search}%`)
  }

  query += ` ORDER BY c.lastMessageAt DESC LIMIT 100`

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[]

  const conversations = rows.map(r => ({
    ...parseCustomer(r),
    lastMessage: {
      content: r.lastMessageContent as string | null,
      role: r.lastMessageRole as string,
      type: r.lastMessageType as string,
      createdAt: r.lastMessageTime as string,
    },
    incomingTotal: Number(r.incomingTotal || 0),
  }))

  res.json({ success: true, data: conversations })
}

/** GET /api/inbox/:customerId – messages for a single conversation */
export async function getMessages(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const { customerId } = req.params

  // Verify customer belongs to this tenant
  const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND tenantId = ?')
    .get(customerId, req.tenantId) as Record<string, unknown> | undefined

  if (!customer) {
    res.status(404).json({ success: false, message: 'Conversation not found' })
    return
  }

  const messages = db.prepare(`
    SELECT * FROM messages
    WHERE tenantId = ? AND customerId = ?
    ORDER BY createdAt ASC
    LIMIT 200
  `).all(req.tenantId, customerId) as Record<string, unknown>[]

  res.json({
    success: true,
    data: {
      customer: parseCustomer(customer),
      messages,
    },
  })
}

/** POST /api/inbox/:customerId/reply – send a reply message */
export async function sendReply(req: Request, res: Response): Promise<void> {
  const { message } = req.body
  const { customerId } = req.params
  const db = getDb()

  if (!message?.trim()) {
    res.status(400).json({ success: false, message: 'Message is required' })
    return
  }

  const customerRow = db.prepare('SELECT * FROM customers WHERE id = ? AND tenantId = ?')
    .get(customerId, req.tenantId) as Record<string, unknown> | undefined

  if (!customerRow) {
    res.status(404).json({ success: false, message: 'Customer not found' })
    return
  }

  const customer = parseCustomer(customerRow)!

  if (customer.isBlocked) {
    res.status(400).json({ success: false, message: 'Customer is blocked' })
    return
  }

  const tenantRow = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenantId) as Record<string, unknown>
  const whatsapp = fromJson<{ phoneNumberId: string; accessToken: string }>(
    tenantRow.whatsapp as string,
    { phoneNumberId: '', accessToken: '' }
  )

  const phone = String(customerRow.phone || '')
  const customerId2 = String(customerRow.id || '')

  const { sendText } = await import('../services/whatsapp.service')
  const result = await sendText({
    phoneNumberId: whatsapp.phoneNumberId,
    accessToken: whatsapp.accessToken,
    to: phone,
    text: message.trim(),
  })

  const now = nowIso()

  if (result.success) {
    const msgId = generateId()
    db.prepare(`
      INSERT INTO messages (id, tenantId, customerId, role, type, content, status, metaMessageId, createdAt)
      VALUES (?, ?, ?, 'assistant', 'text', ?, 'sent', ?, ?)
    `).run(msgId, req.tenantId, customerId2, message.trim(), result.messageId || null, now)

    db.prepare('UPDATE customers SET lastMessageAt = ? WHERE id = ?').run(now, customerId2)

    res.json({ success: true, messageId: msgId })
  } else {
    let errorDetail = result.error || 'Unknown error'
    try {
      const parsed = JSON.parse(result.error || '{}')
      if (parsed?.error?.message) {
        errorDetail = `${parsed.error.message} (code: ${parsed.error.code})`
        if (parsed.error.code === 190) errorDetail += ' — TOKEN EXPIRED'
      }
    } catch { /* ignore */ }

    res.status(500).json({ success: false, message: 'Failed to send message', error: errorDetail })
  }
}
