import { Router, Request, Response } from 'express'
import {
  listAllOrders,
  getOrderWithItems,
  updateOrderStatus,
  getRevenueStats,
} from '../../features/catalog/orderManager'

const router = Router()

const VALID_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']

// GET /api/orders — list all orders
router.get('/', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100
  const offset = parseInt(req.query.offset as string) || 0
  const status = req.query.status as string | undefined

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` })
  }

  const orders = listAllOrders(limit, offset, status)
  const stats = getRevenueStats()
  res.json({ success: true, data: orders, stats })
})

// GET /api/orders/stats
router.get('/stats', (_req: Request, res: Response) => {
  res.json({ success: true, data: getRevenueStats() })
})

// GET /api/orders/:id
router.get('/:id', (req: Request, res: Response) => {
  const order = getOrderWithItems(parseInt(req.params.id))
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' })
  res.json({ success: true, data: order })
})

// PATCH /api/orders/:id/status
router.patch('/:id/status', (req: Request, res: Response) => {
  const { status } = req.body
  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of: ${VALID_STATUSES.join(', ')}` })
  }

  const order = getOrderWithItems(parseInt(req.params.id))
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' })

  updateOrderStatus(order.id, status)
  res.json({ success: true, message: `Order status updated to ${status}` })
})

export default router
