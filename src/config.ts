import dotenv from 'dotenv'
import path from 'path'

dotenv.config()

export const config = {
  // Business
  business: {
    name: process.env.BUSINESS_NAME || 'My Business',
    description: process.env.BUSINESS_DESCRIPTION || 'Quality products and excellent service.',
    hours: process.env.BUSINESS_HOURS || 'Mon-Sat 9AM-6PM',
    phone: process.env.BUSINESS_PHONE || '',
    email: process.env.BUSINESS_EMAIL || '',
    website: process.env.BUSINESS_WEBSITE || '',
    location: process.env.BUSINESS_LOCATION || '',
    currency: process.env.BUSINESS_CURRENCY || 'USD',
  },

  // Ollama AI (runs locally — free, no API key)
  ai: {
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: process.env.AI_MODEL || 'llama3.2',
    maxHistory: parseInt(process.env.MAX_HISTORY || '20'),
    handoffKeywords: (process.env.HANDOFF_KEYWORDS || 'human,agent,representative,person,manager')
      .split(',')
      .map(k => k.trim().toLowerCase()),
  },

  // WhatsApp
  whatsapp: {
    authDir: process.env.AUTH_DIR || './auth_info_baileys',
  },

  // Database
  database: {
    path: process.env.DB_PATH || './data/sme_bot.db',
  },

  // Dashboard
  dashboard: {
    port: parseInt(process.env.DASHBOARD_PORT || '3000'),
    frontendPort: parseInt(process.env.FRONTEND_PORT || '8000'),
    secret: process.env.DASHBOARD_SECRET || 'change_me',
    adminEmail: process.env.ADMIN_EMAIL || '',
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },

  // Bot behavior
  bot: {
    showWelcomeMenu: process.env.SHOW_WELCOME_MENU !== 'false',
    replyDelayMs: parseInt(process.env.REPLY_DELAY_MS || '1000'),
    rateLimitPerMin: parseInt(process.env.RATE_LIMIT_PER_MIN || '10'),
  },
}

// No API key needed — Ollama runs locally for free!

// Ensure data directory exists
import fs from 'fs'
const dataDir = path.dirname(config.database.path)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}
