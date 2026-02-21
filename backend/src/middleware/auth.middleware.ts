import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import { getDb, parseTenant } from '../database/sqlite'

export interface TenantRecord {
  id: string
  _id: string
  businessName: string
  businessType: string
  email: string
  phone?: string
  website?: string
  address?: string
  timezone?: string
  currency?: string
  logoUrl?: string
  role: string
  isActive: boolean
  whatsapp: {
    phoneNumberId: string
    businessAccountId: string
    accessToken: string
    webhookVerifyToken: string
    displayName: string
    isVerified: boolean
  }
  subscription: {
    plan: string
    status: string
    messagesUsedThisMonth: number
    messagesResetAt: string
  }
  settings: Record<string, unknown>
  teamMembers: unknown[]
  lastLoginAt?: string
  createdAt?: string
  updatedAt?: string
}

interface JwtPayload {
  tenantId: string
  email: string
  role: string
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantRecord
      tenantId?: string
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'No token provided' })
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload
    const db = getDb()
    const row = db.prepare('SELECT * FROM tenants WHERE id = ?').get(decoded.tenantId) as Record<string, unknown> | undefined
    const tenant = parseTenant(row) as TenantRecord | null

    if (!tenant || !tenant.isActive) {
      res.status(401).json({ success: false, message: 'Account not found or inactive' })
      return
    }

    req.tenant = tenant
    req.tenantId = tenant.id
    next()
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' })
  }
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.tenant?.role !== 'superadmin') {
    res.status(403).json({ success: false, message: 'Super admin access required' })
    return
  }
  next()
}

export function requirePlan(
  plans: ('trial' | 'basic' | 'pro' | 'enterprise')[]
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const plan = req.tenant?.subscription?.plan
    if (!plan || !plans.includes(plan as 'trial' | 'basic' | 'pro' | 'enterprise')) {
      res.status(403).json({
        success: false,
        message: `This feature requires ${plans.join(' or ')} plan`,
        upgradeRequired: true,
      })
      return
    }
    next()
  }
}
