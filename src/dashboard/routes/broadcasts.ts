import { Router, Request, Response } from 'express'
import {
  createBroadcast,
  getBroadcast,
  listBroadcasts,
  updateBroadcast,
  cancelBroadcast,
  sendBroadcast,
  getFestivalTemplate,
  FESTIVAL_TEMPLATES,
  optOut,
  optIn,
} from '../../features/broadcast/broadcastManager'
import { getCustomer } from '../../features/crm/customerManager'

const router = Router()

// GET /api/broadcasts
router.get('/', (req: Request, res: Response) => {
  const status = req.query.status as string | undefined
  res.json({ success: true, data: listBroadcasts(status) })
})

// GET /api/broadcasts/templates — list available festival templates
router.get('/templates', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: Object.entries(FESTIVAL_TEMPLATES).map(([key, message]) => ({ key, preview: message.slice(0, 80) + '...' })),
  })
})

// GET /api/broadcasts/templates/:key — get full template
router.get('/templates/:key', (req: Request, res: Response) => {
  const tpl = getFestivalTemplate(req.params.key)
  if (!tpl) return res.status(404).json({ success: false, message: 'Template not found' })
  res.json({ success: true, data: { key: req.params.key, message: tpl } })
})

// GET /api/broadcasts/:id
router.get('/:id', (req: Request, res: Response) => {
  const broadcast = getBroadcast(parseInt(req.params.id))
  if (!broadcast) return res.status(404).json({ success: false, message: 'Broadcast not found' })
  res.json({ success: true, data: broadcast })
})

// POST /api/broadcasts — create a broadcast
router.post('/', (req: Request, res: Response) => {
  const { name, message, target_tags, scheduled_at } = req.body
  if (!name || !message) {
    return res.status(400).json({ success: false, message: 'name and message are required' })
  }
  const broadcast = createBroadcast({ name, message, target_tags, scheduled_at })
  res.status(201).json({ success: true, data: broadcast })
})

// POST /api/broadcasts/from-template — create from a festival template
router.post('/from-template', (req: Request, res: Response) => {
  const { template_key, name, scheduled_at, target_tags } = req.body
  if (!template_key) return res.status(400).json({ success: false, message: 'template_key is required' })

  const message = getFestivalTemplate(template_key)
  if (!message) return res.status(404).json({ success: false, message: 'Template not found' })

  const broadcast = createBroadcast({
    name: name || `${template_key} campaign`,
    message,
    target_tags,
    scheduled_at,
  })
  res.status(201).json({ success: true, data: broadcast })
})

// PATCH /api/broadcasts/:id
router.patch('/:id', (req: Request, res: Response) => {
  const broadcast = getBroadcast(parseInt(req.params.id))
  if (!broadcast) return res.status(404).json({ success: false, message: 'Broadcast not found' })
  if (broadcast.status === 'sent') {
    return res.status(400).json({ success: false, message: 'Cannot edit a sent broadcast' })
  }
  updateBroadcast(broadcast.id, req.body)
  res.json({ success: true, data: getBroadcast(broadcast.id) })
})

// POST /api/broadcasts/:id/send — send immediately
router.post('/:id/send', async (req: Request, res: Response) => {
  const broadcast = getBroadcast(parseInt(req.params.id))
  if (!broadcast) return res.status(404).json({ success: false, message: 'Broadcast not found' })

  try {
    // Fire-and-forget for large sends; return accepted immediately
    res.json({ success: true, message: 'Broadcast started', id: broadcast.id })
    await sendBroadcast(broadcast.id)
  } catch (err: any) {
    // Error after response already sent — just log
    require('../../utils/logger').logger.error({ err }, 'Broadcast send error')
  }
})

// POST /api/broadcasts/:id/cancel
router.post('/:id/cancel', (req: Request, res: Response) => {
  cancelBroadcast(parseInt(req.params.id))
  res.json({ success: true, message: 'Broadcast cancelled' })
})

// ─── Opt-out management ───────────────────────────────
// POST /api/broadcasts/optout/:phone
router.post('/optout/:phone', (req: Request, res: Response) => {
  const customer = getCustomer(decodeURIComponent(req.params.phone))
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' })
  optOut(customer.id)
  res.json({ success: true, message: 'Customer opted out' })
})

// POST /api/broadcasts/optin/:phone
router.post('/optin/:phone', (req: Request, res: Response) => {
  const customer = getCustomer(decodeURIComponent(req.params.phone))
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' })
  optIn(customer.id)
  res.json({ success: true, message: 'Customer opted back in' })
})

export default router
