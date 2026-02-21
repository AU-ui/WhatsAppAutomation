import { Router, Request, Response } from 'express'
import {
  listCustomers,
  getCustomer,
  getCustomerById,
  upsertCustomer,
  updateCustomerName,
  updateCustomerLanguage,
  blockCustomer,
  addLeadNote,
  updateLeadScore,
  getCustomerStats,
  searchCustomers,
} from '../../features/crm/customerManager'
import { getConversation } from '../../features/crm/customerManager'
import { getCustomerOrders } from '../../features/catalog/orderManager'
import { getDb } from '../../database/db'

const router = Router()

// POST /api/customers — manually add a customer (pre-load guest list)
router.post('/', (req: Request, res: Response) => {
  const { name, phone, tags } = req.body
  if (!phone) return res.status(400).json({ success: false, message: 'phone is required' })

  // Normalise: strip +, spaces, dashes → 923001234567@s.whatsapp.net
  const digits = String(phone).replace(/\D/g, '')
  const jid = `${digits}@s.whatsapp.net`

  const customer = upsertCustomer(jid, name || undefined)

  // Apply audience tags if provided (stored as JSON array on the customer row)
  if (Array.isArray(tags) && tags.length) {
    getDb().prepare(`UPDATE customers SET tags = ? WHERE id = ?`)
      .run(JSON.stringify(tags), customer.id)
  }

  const fresh = getCustomerById(customer.id)
  res.status(201).json({ success: true, data: fresh })
})

// PATCH /api/customers/:id/tags — update audience tags
router.patch('/:id/tags', (req: Request, res: Response) => {
  const { tags } = req.body
  if (!Array.isArray(tags)) return res.status(400).json({ success: false, message: 'tags must be an array' })
  getDb().prepare(`UPDATE customers SET tags = ? WHERE id = ?`)
    .run(JSON.stringify(tags), parseInt(req.params.id))
  res.json({ success: true })
})

// GET /api/customers — list all customers
router.get('/', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100
  const offset = parseInt(req.query.offset as string) || 0
  const q = req.query.q as string

  const customers = q ? searchCustomers(q) : listCustomers(limit, offset)
  const stats = getCustomerStats()
  res.json({ success: true, data: customers, stats })
})

// GET /api/customers/stats
router.get('/stats', (_req: Request, res: Response) => {
  res.json({ success: true, data: getCustomerStats() })
})

// GET /api/customers/:id
router.get('/:id', (req: Request, res: Response) => {
  const customer = getCustomerById(parseInt(req.params.id))
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' })

  const conv = getConversation(customer.id)
  const orders = getCustomerOrders(customer.id)
  const notes = getDb().prepare(`SELECT * FROM lead_notes WHERE customer_id = ? ORDER BY created_at DESC`).all(customer.id)

  res.json({ success: true, data: { customer, conversation: conv, orders, notes } })
})

// PATCH /api/customers/:id
router.patch('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const { name, language, lead_score, notes } = req.body

  if (name) updateCustomerName(id, name)
  if (language) updateCustomerLanguage(id, language)
  if (typeof lead_score === 'number') updateLeadScore(id, lead_score)
  if (notes) getDb().prepare(`UPDATE customers SET notes = ? WHERE id = ?`).run(notes, id)

  res.json({ success: true, message: 'Customer updated' })
})

// POST /api/customers/:id/block
router.post('/:id/block', (req: Request, res: Response) => {
  blockCustomer(parseInt(req.params.id))
  res.json({ success: true, message: 'Customer blocked' })
})

// POST /api/customers/:id/unblock
router.post('/:id/unblock', (req: Request, res: Response) => {
  getDb().prepare(`UPDATE customers SET is_blocked = 0 WHERE id = ?`).run(parseInt(req.params.id))
  res.json({ success: true, message: 'Customer unblocked' })
})

// POST /api/customers/:id/notes
router.post('/:id/notes', (req: Request, res: Response) => {
  const { note, author } = req.body
  if (!note) return res.status(400).json({ success: false, message: 'note is required' })
  addLeadNote(parseInt(req.params.id), note, author || 'admin')
  res.json({ success: true, message: 'Note added' })
})

// GET /api/customers/:id/messages — conversation history
router.get('/:id/messages', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50
  const messages = getDb().prepare(`
    SELECT * FROM messages WHERE customer_id = ? ORDER BY timestamp DESC LIMIT ?
  `).all(parseInt(req.params.id), limit)
  res.json({ success: true, data: messages.reverse() })
})

export default router
