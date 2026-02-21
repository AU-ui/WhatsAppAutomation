import { Router } from 'express'
import { verifyWebhook, handleWebhook } from '../controllers/webhook.controller'

const router = Router()

// Meta webhook verification
router.get('/', verifyWebhook)

// Incoming messages & status updates
router.post('/', handleWebhook)

export default router
