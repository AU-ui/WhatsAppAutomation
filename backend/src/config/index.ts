import dotenv from 'dotenv'
dotenv.config()

function required(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback
}

export const config = {
  server: {
    port: parseInt(optional('PORT', '5000')),
    nodeEnv: optional('NODE_ENV', 'development'),
    frontendUrl: optional('FRONTEND_URL', 'http://localhost:8000'),
    isDev: optional('NODE_ENV', 'development') === 'development',
  },

  db: {
    path: optional('SQLITE_PATH', './data/platform.db'),
  },

  jwt: {
    secret: optional('JWT_SECRET', 'dev_secret_change_in_production_min_64_chars_long'),
    expiresIn: optional('JWT_EXPIRES_IN', '7d'),
    refreshSecret: optional('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_in_production'),
    refreshExpiresIn: optional('JWT_REFRESH_EXPIRES_IN', '30d'),
  },

  meta: {
    verifyToken: optional('META_VERIFY_TOKEN', 'whatsapp_verify_token'),
    appSecret: optional('META_APP_SECRET', ''),
    graphApiVersion: 'v19.0',
    graphApiBaseUrl: 'https://graph.facebook.com',
  },

  openai: {
    apiKey: optional('OPENAI_API_KEY', ''),
    model: optional('OPENAI_MODEL', 'gpt-4o-mini'),
    maxTokens: parseInt(optional('OPENAI_MAX_TOKENS', '500')),
  },

  stripe: {
    secretKey: optional('STRIPE_SECRET_KEY', ''),
    webhookSecret: optional('STRIPE_WEBHOOK_SECRET', ''),
    prices: {
      basic: optional('STRIPE_BASIC_PRICE_ID', ''),
      pro: optional('STRIPE_PRO_PRICE_ID', ''),
      enterprise: optional('STRIPE_ENTERPRISE_PRICE_ID', ''),
    },
  },

  superAdmin: {
    email: optional('SUPER_ADMIN_EMAIL', 'admin@platform.com'),
    password: optional('SUPER_ADMIN_PASSWORD', 'admin123'),
  },

  upload: {
    path: optional('UPLOAD_PATH', './uploads'),
    maxFileSizeMb: parseInt(optional('MAX_FILE_SIZE_MB', '10')),
  },

  rateLimit: {
    windowMs: parseInt(optional('RATE_LIMIT_WINDOW_MS', '60000')),
    maxRequests: parseInt(optional('RATE_LIMIT_MAX_REQUESTS', '100')),
  },

  log: {
    level: optional('LOG_LEVEL', 'info'),
    dir: optional('LOG_DIR', './logs'),
  },
}

// Subscription plan limits
export const PLAN_LIMITS = {
  basic: {
    monthlyMessages: 1000,
    contacts: 500,
    templates: 10,
    broadcastsPerMonth: 5,
    teamMembers: 1,
    aiReplies: false,
    customFlows: false,
  },
  pro: {
    monthlyMessages: 10000,
    contacts: 5000,
    templates: 50,
    broadcastsPerMonth: 30,
    teamMembers: 5,
    aiReplies: true,
    customFlows: true,
  },
  enterprise: {
    monthlyMessages: -1, // unlimited
    contacts: -1,
    templates: -1,
    broadcastsPerMonth: -1,
    teamMembers: -1,
    aiReplies: true,
    customFlows: true,
  },
}

export const BUSINESS_TYPES = [
  'hotel',
  'restaurant',
  'grocery',
  'retail_sme',
  'agency_marketing',
  'agency_travel',
  'agency_recruitment',
  'vendor_distributor',
  'real_estate',
  'clinic',
  'salon',
  'ecommerce',
  'service',
  'general',
] as const

export type BusinessType = typeof BUSINESS_TYPES[number]
