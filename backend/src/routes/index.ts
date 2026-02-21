import { Router } from 'express'
import webhookRoutes from './webhook.routes'
import fbRoutes from './facebook.routes'
import authRoutes from './auth.routes'
import customerRoutes from './customer.routes'
import productRoutes from './product.routes'
import broadcastRoutes from './broadcast.routes'
import analyticsRoutes from './analytics.routes'
import autoFlowRoutes from './autoflow.routes'
import orderRoutes from './order.routes'
import templateRoutes from './template.routes'
import inboxRoutes from './inbox.routes'

const router = Router()

// Public routes
router.use('/webhook', webhookRoutes)
router.use('/webhook/fb-leads', fbRoutes)
router.use('/auth', authRoutes)

// Protected routes (require JWT)
router.use('/customers', customerRoutes)
router.use('/products', productRoutes)
router.use('/broadcasts', broadcastRoutes)
router.use('/analytics', analyticsRoutes)
router.use('/flows', autoFlowRoutes)
router.use('/orders', orderRoutes)
router.use('/templates', templateRoutes)
router.use('/inbox', inboxRoutes)

export default router
