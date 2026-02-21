import { Router } from 'express'
import { getConversations, getMessages, sendReply } from '../controllers/inbox.controller'
import { authenticate } from '../middleware/auth.middleware'

const router = Router()
router.use(authenticate)

router.get('/', getConversations)
router.get('/:customerId', getMessages)
router.post('/:customerId/reply', sendReply)

export default router
