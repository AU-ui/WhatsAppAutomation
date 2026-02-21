import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { getDb, parseOrder, fromJson, nowIso } from '../database/sqlite'
import { sendFeedbackRequest, sendAppointmentReminder } from '../services/broadcast.service'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res) => {
  const { page = 1, limit = 20, status, type } = req.query
  const db = getDb()

  const conditions: string[] = ['o.tenantId = ?']
  const params: unknown[] = [req.tenantId]
  if (status) { conditions.push('o.status = ?'); params.push(status) }
  if (type) { conditions.push('o.type = ?'); params.push(type) }

  const where = conditions.join(' AND ')
  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM orders o WHERE ${where}`).get(...params) as { cnt: number }).cnt
  const offset = (Number(page) - 1) * Number(limit)
  const rows = db.prepare(`
    SELECT o.*, c.name as customerName, c.phone as customerPhone
    FROM orders o
    LEFT JOIN customers c ON o.customerId = c.id
    WHERE ${where}
    ORDER BY o.createdAt DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset) as Record<string, unknown>[]

  const orders = rows.map(r => ({
    ...parseOrder(r)!,
    customer: { id: r.customerId, name: r.customerName, phone: r.customerPhone },
  }))

  res.json({ success: true, data: orders, pagination: { page: Number(page), limit: Number(limit), total } })
})

router.get('/:id', async (req, res) => {
  const db = getDb()
  const row = db.prepare(`
    SELECT o.*, c.name as customerName, c.phone as customerPhone, c.email as customerEmail
    FROM orders o
    LEFT JOIN customers c ON o.customerId = c.id
    WHERE o.id = ? AND o.tenantId = ?
  `).get(req.params.id, req.tenantId) as Record<string, unknown> | undefined

  if (!row) {
    res.status(404).json({ success: false, message: 'Order not found' })
    return
  }
  res.json({
    success: true,
    data: {
      ...parseOrder(row)!,
      customer: { id: row.customerId, name: row.customerName, phone: row.customerPhone, email: row.customerEmail },
    },
  })
})

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body
  const db = getDb()

  const result = db.prepare('UPDATE orders SET status = ?, updatedAt = ? WHERE id = ? AND tenantId = ?').run(status, nowIso(), req.params.id, req.tenantId)

  if (result.changes === 0) {
    res.status(404).json({ success: false, message: 'Order not found' })
    return
  }

  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) as Record<string, unknown>
  const order = parseOrder(row)!

  // Auto-trigger feedback on completion
  if (status === 'completed' && !row.feedbackSentAt) {
    sendFeedbackRequest(String(req.tenantId), String(row.customerId), String(row.id)).catch(() => {})
  }

  res.json({ success: true, data: order })
})

router.post('/:id/send-reminder', async (req, res) => {
  await sendAppointmentReminder(String(req.tenantId), req.params.id)
  res.json({ success: true, message: 'Reminder sent' })
})

export default router
