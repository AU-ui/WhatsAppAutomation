import { Router } from 'express'
import {
  getAutoFlows, getAutoFlow, createAutoFlow, updateAutoFlow,
  deleteAutoFlow, toggleAutoFlow, getDefaultFlows,
} from '../controllers/autoflow.controller'
import { authenticate } from '../middleware/auth.middleware'

const router = Router()
router.use(authenticate)

router.get('/', getAutoFlows)
router.get('/defaults', getDefaultFlows)
router.post('/', createAutoFlow)
router.get('/:id', getAutoFlow)
router.patch('/:id', updateAutoFlow)
router.delete('/:id', deleteAutoFlow)
router.post('/:id/toggle', toggleAutoFlow)

export default router
