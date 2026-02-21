/**
 * WhatsApp SME Automation — Entry Point
 *
 * Starts:
 *  1. SQLite database (auto-migrates schema)
 *  2. Admin REST API dashboard
 *  3. WhatsApp Bot (Baileys — QR code scan on first run)
 */

import './config'              // loads .env and validates API key
import { getDb } from './database/db'
import { startDashboard, startFrontend } from './dashboard/server'
import { connectWhatsApp } from './whatsapp/client'
import { initBroadcastSchema, runScheduledBroadcasts, runAutoTriggers } from './features/broadcast/broadcastManager'
import { logger } from './utils/logger'

async function main() {
  logger.info('Starting WhatsApp SME Automation...')

  // 1. Initialize database + broadcast tables
  getDb()
  initBroadcastSchema()
  logger.info('Database ready')

  // 2. Start admin dashboard API + web UI on separate ports
  startDashboard()
  startFrontend()

  // 3. Connect WhatsApp (shows QR code in terminal on first run)
  logger.info('Connecting to WhatsApp...')
  await connectWhatsApp()

  // 4. Scheduler — runs every 60s for broadcasts + auto triggers
  setInterval(() => {
    runScheduledBroadcasts().catch(logger.error)
  }, 60_000)

  // Auto triggers run every hour (re-engagement, festival greetings, VIP upgrades)
  setInterval(() => {
    runAutoTriggers().catch(logger.error)
  }, 60 * 60_000)

  logger.info('Automation scheduler active')
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...')
  process.exit(0)
})

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception')
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection')
  process.exit(1)
})

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error')
  process.exit(1)
})
