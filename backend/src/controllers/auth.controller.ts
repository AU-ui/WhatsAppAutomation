import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { config } from '../config'
import { getDb, generateId, toJson, fromJson, nowIso, parseTenant } from '../database/sqlite'
import { logger } from '../utils/logger'

// In-memory rate limiter: email → { count, lockedUntil }
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>()
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000 // 15 minutes

function checkRateLimit(email: string): { blocked: boolean; remaining: number; retryAfter?: number } {
  const now = Date.now()
  const rec = loginAttempts.get(email)
  if (!rec) return { blocked: false, remaining: MAX_ATTEMPTS }
  if (rec.lockedUntil > now) {
    return { blocked: true, remaining: 0, retryAfter: Math.ceil((rec.lockedUntil - now) / 1000) }
  }
  if (rec.count >= MAX_ATTEMPTS && rec.lockedUntil <= now) {
    // Lockout expired — reset
    loginAttempts.delete(email)
    return { blocked: false, remaining: MAX_ATTEMPTS }
  }
  return { blocked: false, remaining: MAX_ATTEMPTS - rec.count }
}

function recordFailedAttempt(email: string): void {
  const now = Date.now()
  const rec = loginAttempts.get(email) || { count: 0, lockedUntil: 0 }
  rec.count += 1
  if (rec.count >= MAX_ATTEMPTS) rec.lockedUntil = now + LOCKOUT_MS
  loginAttempts.set(email, rec)
}

function clearAttempts(email: string): void {
  loginAttempts.delete(email)
}

function generateToken(tenantId: string, email: string, role: string): string {
  return jwt.sign({ tenantId, email, role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions)
}

export async function register(req: Request, res: Response): Promise<void> {
  const { businessName, businessType, email, password, phone } = req.body
  const db = getDb()

  const existing = db.prepare('SELECT id FROM tenants WHERE email = ?').get(email)
  if (existing) {
    res.status(409).json({ success: false, message: 'Email already registered' })
    return
  }

  const hashedPassword = await bcrypt.hash(password, 12)
  const id = generateId()
  const now = nowIso()

  const defaultSubscription = toJson({
    plan: 'trial',
    status: 'active',
    messagesUsedThisMonth: 0,
    messagesResetAt: now,
  })
  const defaultSettings = toJson({ aiEnabled: true, brandTone: 'friendly', autoReplyEnabled: true })
  const defaultWhatsapp = toJson({ phoneNumberId: '', businessAccountId: '', accessToken: '', webhookVerifyToken: '', displayName: '', isVerified: false })

  db.prepare(`
    INSERT INTO tenants (id, businessName, businessType, email, password, phone, role, isActive, whatsapp, subscription, settings, teamMembers, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, 'tenant', 1, ?, ?, ?, '[]', ?, ?)
  `).run(id, businessName, businessType || 'general', email, hashedPassword, phone || null, defaultWhatsapp, defaultSubscription, defaultSettings, now, now)

  const token = generateToken(id, email, 'tenant')
  const subscription = fromJson(defaultSubscription, {})

  logger.info({ tenantId: id, email }, 'New tenant registered')

  res.status(201).json({
    success: true,
    token,
    tenant: {
      id,
      businessName,
      businessType: businessType || 'general',
      email,
      subscription,
    },
  })
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body
  const db = getDb()

  // Rate limit check
  const limit = checkRateLimit(email?.toLowerCase?.() || '')
  if (limit.blocked) {
    res.status(429).json({
      success: false,
      message: `Too many failed attempts. Try again in ${limit.retryAfter} seconds.`,
    })
    return
  }

  const row = db.prepare('SELECT * FROM tenants WHERE email = ?').get(email) as Record<string, unknown> | undefined
  if (!row) {
    recordFailedAttempt(email?.toLowerCase?.() || '')
    res.status(401).json({ success: false, message: 'Invalid email or password' })
    return
  }

  const passwordMatch = await bcrypt.compare(password, row.password as string)
  if (!passwordMatch) {
    recordFailedAttempt(email?.toLowerCase?.() || '')
    const after = checkRateLimit(email?.toLowerCase?.() || '')
    res.status(401).json({
      success: false,
      message: after.blocked
        ? `Account temporarily locked. Try again in ${after.retryAfter} seconds.`
        : `Invalid email or password (${after.remaining} attempt${after.remaining !== 1 ? 's' : ''} remaining)`,
    })
    return
  }

  if (!row.isActive) {
    res.status(403).json({ success: false, message: 'Account is deactivated' })
    return
  }

  clearAttempts(email?.toLowerCase?.() || '')

  const tenant = parseTenant(row)!
  const token = generateToken(String(row.id), String(row.email), String(row.role))

  db.prepare('UPDATE tenants SET lastLoginAt = ? WHERE id = ?').run(nowIso(), String(row.id))

  res.json({
    success: true,
    token,
    tenant: {
      id: tenant.id,
      businessName: tenant.businessName,
      businessType: tenant.businessType,
      email: tenant.email,
      role: tenant.role,
      subscription: tenant.subscription,
      settings: tenant.settings,
      whatsapp: {
        phoneNumberId: tenant.whatsapp.phoneNumberId,
        displayName: tenant.whatsapp.displayName,
        isVerified: tenant.whatsapp.isVerified,
      },
    },
  })
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const tenant = req.tenant!
  res.json({
    success: true,
    tenant: {
      id: tenant.id,
      businessName: tenant.businessName,
      businessType: tenant.businessType,
      email: tenant.email,
      phone: tenant.phone,
      website: tenant.website,
      address: tenant.address,
      currency: tenant.currency,
      logoUrl: tenant.logoUrl,
      role: tenant.role,
      subscription: tenant.subscription,
      settings: tenant.settings,
      teamMembers: tenant.teamMembers,
      whatsapp: {
        phoneNumberId: tenant.whatsapp.phoneNumberId,
        businessAccountId: tenant.whatsapp.businessAccountId,
        displayName: tenant.whatsapp.displayName,
        isVerified: tenant.whatsapp.isVerified,
        webhookVerifyToken: tenant.whatsapp.webhookVerifyToken,
      },
    },
  })
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const allowedUpdates = ['businessName', 'businessType', 'phone', 'website', 'address', 'currency', 'logoUrl', 'timezone']
  const sets: string[] = []
  const values: unknown[] = []

  for (const key of allowedUpdates) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = ?`)
      values.push(req.body[key])
    }
  }

  if (sets.length === 0) {
    res.json({ success: true })
    return
  }

  sets.push('updatedAt = ?')
  values.push(nowIso())
  values.push(req.tenantId)

  getDb().prepare(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`).run(...values)

  const row = getDb().prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenantId) as Record<string, unknown>
  res.json({ success: true, tenant: parseTenant(row) })
}

export async function updateSettings(req: Request, res: Response): Promise<void> {
  const { settings } = req.body
  const db = getDb()

  const allowedSettings = [
    'welcomeMessage', 'awayMessage', 'aiEnabled', 'aiPersonality',
    'brandTone', 'autoReplyEnabled', 'humanHandoffEnabled', 'handoffKeywords', 'businessHours',
    'facebookPageId', 'facebookPageAccessToken', 'facebookLeadWelcomeMessage',
  ]

  const row = db.prepare('SELECT settings FROM tenants WHERE id = ?').get(req.tenantId) as { settings: string }
  const currentSettings = fromJson<Record<string, unknown>>(row?.settings, {})

  for (const key of allowedSettings) {
    if (settings?.[key] !== undefined) {
      currentSettings[key] = settings[key]
    }
  }

  db.prepare('UPDATE tenants SET settings = ?, updatedAt = ? WHERE id = ?')
    .run(toJson(currentSettings), nowIso(), req.tenantId)

  res.json({ success: true, settings: currentSettings })
}

export async function updateWhatsAppCredentials(req: Request, res: Response): Promise<void> {
  const { phoneNumberId, businessAccountId, accessToken, webhookVerifyToken, displayName } = req.body
  const db = getDb()

  const row = db.prepare('SELECT whatsapp FROM tenants WHERE id = ?').get(req.tenantId) as { whatsapp: string }
  const currentWhatsapp = fromJson<Record<string, unknown>>(row?.whatsapp, {})

  const updated = {
    ...currentWhatsapp,
    phoneNumberId: phoneNumberId || currentWhatsapp.phoneNumberId,
    businessAccountId: businessAccountId || currentWhatsapp.businessAccountId,
    ...(accessToken && { accessToken }),
    ...(webhookVerifyToken && { webhookVerifyToken }),
    ...(displayName && { displayName }),
  }

  db.prepare('UPDATE tenants SET whatsapp = ?, updatedAt = ? WHERE id = ?')
    .run(toJson(updated), nowIso(), req.tenantId)

  // Verify the credentials
  try {
    const { getPhoneNumberInfo } = await import('../services/whatsapp.service')
    const info = await getPhoneNumberInfo(phoneNumberId, (updated.accessToken as string) || '')
    if (info) {
      updated.isVerified = true
      db.prepare('UPDATE tenants SET whatsapp = ? WHERE id = ?').run(toJson(updated), req.tenantId)
      res.json({ success: true, verified: true, phoneInfo: info })
      return
    }
  } catch {
    // Verification failed — still save credentials
  }

  res.json({ success: true, verified: false })
}
