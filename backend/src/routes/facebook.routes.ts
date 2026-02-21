import { Router } from 'express'
import { verifyFbWebhook, handleFbLeadWebhook } from '../controllers/facebook.controller'

const router = Router()

// Facebook webhook verification (GET)
router.get('/', verifyFbWebhook)

// Incoming lead notifications (POST)
router.post('/', handleFbLeadWebhook)

export default router
