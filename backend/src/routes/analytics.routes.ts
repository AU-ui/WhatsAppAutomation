import { Router } from 'express'
import {
  getDashboardStats, getAnalyticsTrend, getTopCustomers,
  getRevenueByPeriod, getConversionFunnel,
} from '../controllers/analytics.controller'
import { authenticate } from '../middleware/auth.middleware'

const router = Router()
router.use(authenticate)

router.get('/dashboard', getDashboardStats)
router.get('/trend', getAnalyticsTrend)
router.get('/top-customers', getTopCustomers)
router.get('/revenue', getRevenueByPeriod)
router.get('/funnel', getConversionFunnel)

export default router
