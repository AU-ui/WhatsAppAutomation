import { Router } from 'express'
import {
  getCustomers, getCustomer, updateCustomer, blockCustomer,
  unblockCustomer, getCustomerStats, sendDirectMessage,
} from '../controllers/customer.controller'
import { authenticate } from '../middleware/auth.middleware'

const router = Router()
router.use(authenticate)

router.get('/', getCustomers)
router.get('/stats', getCustomerStats)
router.get('/:id', getCustomer)
router.patch('/:id', updateCustomer)
router.post('/:id/block', blockCustomer)
router.post('/:id/unblock', unblockCustomer)
router.post('/:id/message', sendDirectMessage)

export default router
