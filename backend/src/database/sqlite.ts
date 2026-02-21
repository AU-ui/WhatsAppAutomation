/**
 * SQLite Database Layer
 * Replaces MongoDB/Mongoose — no server required, file-based storage
 */
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { config } from '../config'

let _db: Database.Database

export function initDatabase(): void {
  const dbPath = config.db.path
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  createTables()
  console.log(`✅ SQLite database ready at ${dbPath}`)
}

export function getDb(): Database.Database {
  if (!_db) throw new Error('Database not initialized')
  return _db
}

// ─── Helpers ──────────────────────────────────────────────────────

export function generateId(): string {
  return crypto.randomBytes(16).toString('hex')
}

export function toJson(val: unknown): string {
  return JSON.stringify(val ?? null)
}

export function fromJson<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback
  try { return JSON.parse(str) as T } catch { return fallback }
}

export function nowIso(): string {
  return new Date().toISOString()
}

// ─── Row Parsers (SQLite → JS object) ────────────────────────────

export function parseTenant(row: Record<string, unknown> | undefined) {
  if (!row) return null
  return {
    ...row,
    _id: row.id,
    isActive: Boolean(row.isActive),
    whatsapp: fromJson(row.whatsapp as string, {
      phoneNumberId: '', businessAccountId: '', accessToken: '',
      webhookVerifyToken: '', displayName: '', isVerified: false,
    }),
    subscription: fromJson(row.subscription as string, {
      plan: 'trial', status: 'active', messagesUsedThisMonth: 0,
      messagesResetAt: new Date().toISOString(),
    }),
    settings: fromJson(row.settings as string, {
      aiEnabled: true, brandTone: 'friendly', autoReplyEnabled: true,
    }),
    teamMembers: fromJson(row.teamMembers as string, []),
  }
}

export function parseCustomer(row: Record<string, unknown> | undefined) {
  if (!row) return null
  return {
    ...row,
    _id: row.id,
    isBlocked: Boolean(row.isBlocked),
    optIn: Boolean(row.optIn),
    tags: fromJson(row.tags as string, []),
    customFields: fromJson(row.customFields as string, {}),
    conversationContext: fromJson(row.conversationContext as string, {}),
  }
}

export function parseProduct(row: Record<string, unknown> | undefined) {
  if (!row) return null
  return {
    ...row,
    _id: row.id,
    isActive: Boolean(row.isActive),
    isFeatured: Boolean(row.isFeatured),
    notifyOnAdd: Boolean(row.notifyOnAdd),
    tags: fromJson(row.tags as string, []),
    attributes: fromJson(row.attributes as string, {}),
  }
}

export function parseOrder(row: Record<string, unknown> | undefined) {
  if (!row) return null
  return {
    ...row,
    _id: row.id,
    items: fromJson(row.items as string, []),
  }
}

export function parseBroadcast(row: Record<string, unknown> | undefined) {
  if (!row) return null
  return {
    ...row,
    _id: row.id,
    isAutoTriggered: Boolean(row.isAutoTriggered),
    audience: fromJson(row.audience as string, {}),
    recipients: fromJson(row.recipients as string, []),
    stats: fromJson(row.stats as string, { totalRecipients: 0, sent: 0, failed: 0, delivered: 0, read: 0 }),
    templateVariables: fromJson(row.templateVariables as string, {}),
  }
}

export function parseAutoFlow(row: Record<string, unknown> | undefined) {
  if (!row) return null
  return {
    ...row,
    _id: row.id,
    isActive: Boolean(row.isActive),
    triggers: fromJson(row.triggers as string, []),
    actions: fromJson(row.actions as string, []),
  }
}

export function parseTemplate(row: Record<string, unknown> | undefined) {
  if (!row) return null
  return {
    ...row,
    _id: row.id,
    isPrebuilt: Boolean(row.isPrebuilt),
    components: fromJson(row.components as string, []),
    variables: fromJson(row.variables as string, []),
  }
}

export function parseAnalytics(row: Record<string, unknown> | undefined) {
  if (!row) return null
  return {
    ...row,
    _id: row.id,
    messages: fromJson(row.messages as string, {}),
    customers: fromJson(row.customers as string, {}),
    orders: fromJson(row.orders as string, {}),
    revenue: fromJson(row.revenue as string, {}),
    broadcasts: fromJson(row.broadcasts as string, {}),
    hourlyMessages: fromJson(row.hourlyMessages as string, new Array(24).fill(0)),
  }
}

// ─── Schema ───────────────────────────────────────────────────────

function createTables(): void {
  _db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      businessName TEXT NOT NULL,
      businessType TEXT NOT NULL DEFAULT 'general',
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      phone TEXT,
      website TEXT,
      address TEXT,
      timezone TEXT DEFAULT 'UTC',
      currency TEXT DEFAULT 'USD',
      logoUrl TEXT,
      role TEXT DEFAULT 'tenant',
      isActive INTEGER DEFAULT 1,
      whatsapp TEXT DEFAULT '{}',
      subscription TEXT DEFAULT '{}',
      settings TEXT DEFAULT '{}',
      teamMembers TEXT DEFAULT '[]',
      lastLoginAt TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      phone TEXT NOT NULL,
      name TEXT,
      email TEXT,
      language TEXT DEFAULT 'en',
      tags TEXT DEFAULT '[]',
      segment TEXT DEFAULT 'general',
      notes TEXT,
      optIn INTEGER DEFAULT 1,
      optOutAt TEXT,
      isBlocked INTEGER DEFAULT 0,
      blacklistedReason TEXT,
      conversationState TEXT DEFAULT 'IDLE',
      conversationContext TEXT DEFAULT '{}',
      leadScore INTEGER DEFAULT 0,
      totalOrders INTEGER DEFAULT 0,
      totalSpent REAL DEFAULT 0,
      totalMessages INTEGER DEFAULT 0,
      firstSeenAt TEXT DEFAULT (datetime('now')),
      lastMessageAt TEXT DEFAULT (datetime('now')),
      customFields TEXT DEFAULT '{}',
      createdAt TEXT DEFAULT (datetime('now')),
      UNIQUE(tenantId, phone)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      customerId TEXT NOT NULL,
      role TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      content TEXT,
      mediaUrl TEXT,
      status TEXT DEFAULT 'sent',
      metaMessageId TEXT,
      isFromBroadcast INTEGER DEFAULT 0,
      broadcastId TEXT,
      aiGenerated INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      emoji TEXT DEFAULT '📦',
      imageUrl TEXT,
      sortOrder INTEGER DEFAULT 0,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      categoryId TEXT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL DEFAULT 0,
      discountedPrice REAL,
      type TEXT DEFAULT 'product',
      currency TEXT DEFAULT 'USD',
      stock INTEGER DEFAULT -1,
      isActive INTEGER DEFAULT 1,
      isFeatured INTEGER DEFAULT 0,
      notifyOnAdd INTEGER DEFAULT 0,
      imageUrl TEXT,
      pdfUrl TEXT,
      tags TEXT DEFAULT '[]',
      attributes TEXT DEFAULT '{}',
      sortOrder INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      customerId TEXT NOT NULL,
      orderNumber TEXT NOT NULL UNIQUE,
      type TEXT DEFAULT 'order',
      status TEXT DEFAULT 'pending',
      items TEXT DEFAULT '[]',
      subtotal REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      notes TEXT,
      deliveryAddress TEXT,
      scheduledAt TEXT,
      reminderSentAt TEXT,
      feedbackSentAt TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS broadcasts (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'custom',
      status TEXT DEFAULT 'draft',
      messageType TEXT DEFAULT 'text',
      textContent TEXT,
      mediaUrl TEXT,
      mediaCaption TEXT,
      templateName TEXT,
      templateVariables TEXT DEFAULT '{}',
      audience TEXT DEFAULT '{}',
      recipients TEXT DEFAULT '[]',
      stats TEXT DEFAULT '{}',
      sendRate INTEGER DEFAULT 1,
      scheduledAt TEXT,
      startedAt TEXT,
      completedAt TEXT,
      isAutoTriggered INTEGER DEFAULT 0,
      triggerEvent TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS autoflows (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'custom',
      triggers TEXT DEFAULT '[]',
      actions TEXT DEFAULT '[]',
      isActive INTEGER DEFAULT 1,
      triggerCount INTEGER DEFAULT 0,
      lastTriggeredAt TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      name TEXT NOT NULL,
      displayName TEXT,
      category TEXT DEFAULT 'MARKETING',
      language TEXT DEFAULT 'en_US',
      status TEXT DEFAULT 'pending',
      isPrebuilt INTEGER DEFAULT 0,
      prebuiltType TEXT,
      components TEXT DEFAULT '[]',
      variables TEXT DEFAULT '[]',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS analytics (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      date TEXT NOT NULL,
      messages TEXT DEFAULT '{}',
      customers TEXT DEFAULT '{}',
      orders TEXT DEFAULT '{}',
      revenue TEXT DEFAULT '{}',
      broadcasts TEXT DEFAULT '{}',
      hourlyMessages TEXT DEFAULT '[]',
      UNIQUE(tenantId, date)
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      customerId TEXT NOT NULL,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER DEFAULT 1,
      notes TEXT,
      addedAt TEXT DEFAULT (datetime('now'))
    );
  `)
}
