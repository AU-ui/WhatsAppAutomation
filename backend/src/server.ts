/**
 * Universal WhatsApp Automation Platform — Server Entry Point
 *
 * Stack: Node.js + Express + SQLite + Meta WhatsApp Cloud API + OpenAI
 */
import 'express-async-errors'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import path from 'path'

import { config } from './config'
import { initDatabase } from './database/sqlite'
import { logger } from './utils/logger'
import { startScheduler } from './jobs/scheduler'
import routes from './routes'

const app = express()

// ─── Security Middleware ──────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))

app.use(cors({
  origin: config.server.frontendUrl,
  credentials: true,
}))

// ─── Body Parsing ─────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ─── Compression & Logging ────────────────────────────────────────
app.use(compression())
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
  skip: (req) => req.path === '/health',
}))

// ─── Rate Limiting ────────────────────────────────────────────────
app.use('/api', rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: { success: false, message: 'Too many requests, please try again later.' },
  skip: (req) => req.path.startsWith('/api/webhook'),
}))

// ─── Static Files (uploads) ───────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', config.upload.path)))

// ─── Health Check ─────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0' })
})

// ─── API Routes ───────────────────────────────────────────────────
app.use('/api', routes)

// ─── 404 Handler ─────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' })
})

// ─── Global Error Handler ─────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err: err.message, stack: err.stack }, 'Unhandled error')
  res.status(500).json({
    success: false,
    message: config.server.isDev ? err.message : 'Internal server error',
  })
})

// ─── Bootstrap ────────────────────────────────────────────────────
async function bootstrap() {
  logger.info('🚀 Starting Universal WhatsApp Automation Platform...')

  // Initialize SQLite database
  initDatabase()

  // Start the scheduler
  startScheduler()

  // Start the server
  const server = app.listen(config.server.port, () => {
    logger.info(`✅ Server running on http://localhost:${config.server.port}`)
    logger.info(`📡 Webhook URL: http://localhost:${config.server.port}/api/webhook`)
    logger.info(`🔧 Environment: ${config.server.nodeEnv}`)
  })

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`)
    server.close(() => {
      logger.info('Server closed')
      process.exit(0)
    })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception')
    process.exit(1)
  })
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection')
    process.exit(1)
  })
}

bootstrap()
