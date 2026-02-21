import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import path from 'path'
import rateLimit from 'express-rate-limit'
import { config } from '../config'
import { logger } from '../utils/logger'
import { getDb } from '../database/db'
import { getRevenueStats } from '../features/catalog/orderManager'
import { getCustomerStats } from '../features/crm/customerManager'
import { listHandoffs } from '../features/handoff/agentManager'
import { waState, registerSSEClient } from './whatsappState'
import { v4 as uuidv4 } from 'uuid'
import nodemailer from 'nodemailer'

// ─── Email OTP + Session store ─────────────────────────
interface OTPEntry { otp: string; expiresAt: number }
interface Session  { email: string; expiresAt: number }

const pendingOTPs = new Map<string, OTPEntry>()
const sessions    = new Map<string, Session>()

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}
function isValidSession(token: string): boolean {
  const s = sessions.get(token)
  if (!s) return false
  if (Date.now() > s.expiresAt) { sessions.delete(token); return false }
  return true
}

function getMailer() {
  return nodemailer.createTransport({
    host: config.dashboard.smtp.host,
    port: config.dashboard.smtp.port,
    secure: false,
    auth: { user: config.dashboard.smtp.user, pass: config.dashboard.smtp.pass },
  })
}

import customersRouter from './routes/customers'
import productsRouter from './routes/products'
import ordersRouter from './routes/orders'
import agentsRouter from './routes/agents'
import broadcastsRouter from './routes/broadcasts'

const app = express()

// ─── Security Middleware ───────────────────────────────
// Disable CSP so the dashboard's CDN scripts work in the browser
app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({ origin: '*' }))
app.use(express.json({ limit: '1mb' }))

// Rate limit the dashboard API
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests' },
}))

// Static UI is served by startFrontend() on a separate port

// ─── Public endpoints (no auth) ───────────────────────
app.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok', business: config.business.name, time: new Date().toISOString() })
})

// POST /api/auth/request-otp — send OTP to admin email
app.post('/api/auth/request-otp', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const adminEmail = config.dashboard.adminEmail.toLowerCase()

  if (!adminEmail) {
    // No email configured — auto-approve (local use)
    const token = uuidv4()
    sessions.set(token, { email: 'local', expiresAt: Date.now() + 24 * 60 * 60_000 })
    return res.json({ success: true, token, autoLogin: true })
  }

  if (email !== adminEmail) {
    return res.status(403).json({ success: false, message: 'Email not authorised' })
  }

  const otp = generateOTP()
  pendingOTPs.set(email, { otp, expiresAt: Date.now() + 10 * 60_000 })

  try {
    await getMailer().sendMail({
      from: `"${config.business.name} Bot" <${config.dashboard.smtp.user}>`,
      to: email,
      subject: `Your login code — ${otp}`,
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px">
          <h2 style="color:#16a34a">💬 ${config.business.name}</h2>
          <p>Your admin dashboard login code:</p>
          <div style="font-size:40px;font-weight:bold;letter-spacing:8px;color:#111;padding:20px 0">${otp}</div>
          <p style="color:#666;font-size:13px">Valid for 10 minutes. Do not share this code.</p>
        </div>`,
    })
    logger.info({ email }, 'Login OTP sent via email')
    res.json({ success: true, message: 'Code sent to your email' })
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to send OTP email')
    res.status(500).json({ success: false, message: 'Could not send email. Check SMTP settings in .env' })
  }
})

// POST /api/auth/verify-otp — verify code and return session token
app.post('/api/auth/verify-otp', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const otp   = String(req.body.otp || '').trim()

  const entry = pendingOTPs.get(email)
  if (!entry || entry.otp !== otp || Date.now() > entry.expiresAt) {
    return res.status(401).json({ success: false, message: 'Invalid or expired code' })
  }

  pendingOTPs.delete(email)
  const token = uuidv4()
  sessions.set(token, { email, expiresAt: Date.now() + 24 * 60 * 60_000 })

  logger.info({ email }, 'Admin logged in')
  res.json({ success: true, token })
})

app.get('/api/status', (_req, res) => {
  res.json({ success: true, data: waState })
})

// Tell the frontend whether email login is configured
app.get('/api/auth/mode', (_req, res) => {
  res.json({ emailLogin: !!config.dashboard.adminEmail })
})

// SSE: real-time QR code and connection status — public (no sensitive data)
app.get('/api/status/stream', (req, res) => {

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Send current state immediately on connect
  res.write(`event: status\ndata: ${JSON.stringify({ status: waState.status })}\n\n`)
  if (waState.status === 'qr_ready' && waState.qrString) {
    res.write(`event: qr\ndata: ${JSON.stringify({ qr: waState.qrString })}\n\n`)
  }
  if (waState.status === 'connected') {
    res.write(`event: connected\ndata: ${JSON.stringify({ connectedAt: waState.connectedAt })}\n\n`)
  }

  const unregister = registerSSEClient((chunk) => res.write(chunk))

  req.on('close', unregister)
})

// ─── Auth middleware — accepts session token OR legacy API key ─────
app.use('/api', (req, res, next) => {
  // Public routes — skip auth
  if (req.path === '/status' || req.path.startsWith('/status/')) return next()
  if (req.path.startsWith('/auth/')) return next()
  // If no admin email configured, allow all traffic (local tool, no login set up)
  if (!config.dashboard.adminEmail) return next()

  // Session token (OTP login)
  const token = req.headers['x-session-token'] as string || req.query.token as string
  if (token && isValidSession(token)) return next()

  // Legacy API key (fallback for programmatic access)
  const key = req.headers['x-api-key'] || req.query.key
  if (key === config.dashboard.secret) return next()

  return res.status(401).json({ success: false, message: 'Login required. Use OTP or API key.' })
})

// ─── Dashboard Summary ────────────────────────────────
app.get('/api/summary', (_req, res) => {
  const revenue = getRevenueStats()
  const customers = getCustomerStats()
  const activeHandoffs = listHandoffs('active').length
  const pendingHandoffs = listHandoffs('pending').length

  const db = getDb()
  const productCount = (db.prepare(`SELECT COUNT(*) as c FROM products WHERE active = 1`).get() as { c: number }).c
  const ordersByStatus = db.prepare(`
    SELECT status, COUNT(*) as count FROM orders GROUP BY status
  `).all() as { status: string; count: number }[]

  res.json({
    success: true,
    data: {
      revenue,
      customers,
      products: productCount,
      handoffs: { active: activeHandoffs, pending: pendingHandoffs },
      orders_by_status: ordersByStatus,
    },
  })
})

// ─── Bot Config ───────────────────────────────────────
app.get('/api/config', (_req, res) => {
  const db = getDb()
  const rows = db.prepare(`SELECT key, value FROM bot_config`).all() as { key: string; value: string }[]
  const cfg: Record<string, string> = {}
  for (const row of rows) cfg[row.key] = row.value
  res.json({ success: true, data: cfg })
})

app.patch('/api/config', (req, res) => {
  const db = getDb()
  const updates = req.body as Record<string, string>
  const stmt = db.prepare(`INSERT OR REPLACE INTO bot_config (key, value) VALUES (?, ?)`)
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === 'string') stmt.run(key, value)
  }
  res.json({ success: true, message: 'Config updated' })
})

// ─── Test: send a message from the bot to any number ──
app.post('/api/test/send', async (req, res) => {
  const { phone, message } = req.body
  if (!phone || !message) return res.status(400).json({ success: false, message: 'phone and message required' })

  const { getSocket } = await import('../whatsapp/client')
  const sock = getSocket()
  if (!sock) return res.status(503).json({ success: false, message: 'WhatsApp not connected' })

  const digits = String(phone).replace(/\D/g, '')
  const jid = `${digits}@s.whatsapp.net`

  try {
    await sock.sendMessage(jid, { text: message })
    res.json({ success: true, message: `Sent to ${digits}` })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─── Feature Routes ───────────────────────────────────
app.use('/api/customers', customersRouter)
app.use('/api/products', productsRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/agents', agentsRouter)
app.use('/api/broadcasts', broadcastsRouter)

// ─── 404 ──────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' })
})

// ─── Error Handler ────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Dashboard API error')
  res.status(500).json({ success: false, message: err.message || 'Internal server error' })
})

export function startDashboard(): void {
  app.listen(config.dashboard.port, () => {
    logger.info(`REST API running at http://localhost:${config.dashboard.port}`)
    logger.info(`API key: ${config.dashboard.secret}`)
  })
}

/** Serve the static web UI on a separate port (no auth required) */
export function startFrontend(): void {
  const ui = express()

  // Auto-inject credentials so the browser never shows a login screen
  ui.get('/config.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript')
    res.send(
      `window.WA_API_KEY = ${JSON.stringify(config.dashboard.secret)};\n` +
      `window.WA_API_URL = "http://localhost:${config.dashboard.port}";\n`
    )
  })

  ui.use(express.static(path.resolve(__dirname, '../../public')))
  ui.get('*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, '../../public/index.html'))
  })
  ui.listen(config.dashboard.frontendPort, () => {
    logger.info(`Web UI running at http://localhost:${config.dashboard.frontendPort}`)
  })
}
