import { Router } from 'express'
import { register, login, getMe, updateProfile, updateSettings, updateWhatsAppCredentials } from '../controllers/auth.controller'
import { authenticate } from '../middleware/auth.middleware'

const router = Router()

router.post('/register', register)
router.post('/login', login)
router.get('/me', authenticate, getMe)
router.patch('/profile', authenticate, updateProfile)
router.patch('/settings', authenticate, updateSettings)
router.patch('/whatsapp', authenticate, updateWhatsAppCredentials)

export default router
