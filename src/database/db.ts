import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { config } from '../config'
import { SCHEMA_SQL, DEFAULT_CONFIG } from './schema'
import { logger } from '../utils/logger'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db

  const dbPath = path.resolve(config.database.path)
  const dbDir = path.dirname(dbPath)

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  // Run schema
  _db.exec(SCHEMA_SQL)

  // Seed default config
  const insertConfig = _db.prepare(
    `INSERT OR IGNORE INTO bot_config (key, value) VALUES (?, ?)`
  )
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    insertConfig.run(key, value)
  }

  logger.info({ path: dbPath }, 'Database initialized')
  return _db
}

export function closeDb(): void {
  _db?.close()
  _db = null
}

// ---- Typed query helpers ----

export type Customer = {
  id: number
  phone: string
  name: string | null
  language: string
  first_seen: number
  last_seen: number
  lead_score: number
  tags: string
  notes: string | null
  is_blocked: number
  total_orders: number
  total_spent: number
}

export type Conversation = {
  id: number
  customer_id: number
  state: ConversationState
  context: string
  started_at: number
  last_message_at: number
}

export type ConversationState =
  | 'REGISTERING'       // brand-new customer: bot is collecting their name
  | 'MENU'
  | 'AI_CHAT'
  | 'BROWSING_CATALOG'
  | 'BROWSING_CATEGORY'
  | 'ORDERING'
  | 'CHECKOUT'
  | 'HUMAN_HANDOFF'
  | 'AWAITING_AGENT'

export type Message = {
  id: number
  customer_id: number
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export type Product = {
  id: number
  category_id: number | null
  name: string
  description: string | null
  price: number
  currency: string
  stock: number
  image_url: string | null
  sku: string | null
  active: number
  sort_order: number
}

export type Category = {
  id: number
  name: string
  description: string | null
  emoji: string
  sort_order: number
}

export type Order = {
  id: number
  customer_id: number
  status: string
  total: number
  currency: string
  notes: string | null
  created_at: number
  updated_at: number
}

export type OrderItem = {
  id: number
  order_id: number
  product_id: number
  product_name: string
  quantity: number
  price: number
}

export type CartItem = {
  id: number
  customer_id: number
  product_id: number
  quantity: number
  added_at: number
}

export type Agent = {
  id: number
  name: string
  phone: string
  active: number
  current_customer_id: number | null
  last_active: number | null
}

export type Handoff = {
  id: number
  customer_id: number
  agent_id: number | null
  reason: string | null
  status: string
  created_at: number
  resolved_at: number | null
}
