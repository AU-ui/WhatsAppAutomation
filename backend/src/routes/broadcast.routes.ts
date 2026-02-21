import { Router } from 'express'
import {
  getBroadcasts, getBroadcast, createBroadcast, updateBroadcast,
  scheduleBroadcast, sendBroadcastNow, cancelBroadcast,
  getBroadcastStats, estimateAudience, getTemplates,
} from '../controllers/broadcast.controller'
import { authenticate, requirePlan } from '../middleware/auth.middleware'

const router = Router()
router.use(authenticate)

router.get('/', getBroadcasts)
router.get('/templates', getTemplates)
router.post('/estimate-audience', estimateAudience)
router.post('/', createBroadcast)
router.get('/:id', getBroadcast)
router.patch('/:id', updateBroadcast)
router.post('/:id/schedule', requirePlan(['basic', 'pro', 'enterprise']), scheduleBroadcast)
router.post('/:id/send-now', requirePlan(['basic', 'pro', 'enterprise']), sendBroadcastNow)
router.post('/:id/cancel', cancelBroadcast)
router.get('/:id/stats', getBroadcastStats)

export default router
