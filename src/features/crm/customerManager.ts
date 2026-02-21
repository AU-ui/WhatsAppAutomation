import { getDb, Customer, Conversation, ConversationState } from '../../database/db'
import { logger } from '../../utils/logger'

/** Get or create a customer by phone number */
export function upsertCustomer(phone: string, name?: string): Customer {
  const db = getDb()
  const now = Date.now()

  // Try to find existing
  let customer = db.prepare(`SELECT * FROM customers WHERE phone = ?`).get(phone) as Customer | undefined

  if (!customer) {
    db.prepare(`
      INSERT INTO customers (phone, name, first_seen, last_seen)
      VALUES (?, ?, ?, ?)
    `).run(phone, name || null, now, now)

    customer = db.prepare(`SELECT * FROM customers WHERE phone = ?`).get(phone) as Customer
    logger.info({ phone, name }, 'New customer registered')
  } else {
    // Update last seen and name if provided
    db.prepare(`
      UPDATE customers SET last_seen = ?, name = COALESCE(?, name)
      WHERE phone = ?
    `).run(now, name || null, phone)
    customer = db.prepare(`SELECT * FROM customers WHERE phone = ?`).get(phone) as Customer
  }

  // Ensure conversation record exists
  const existing = db.prepare(`SELECT id FROM conversations WHERE customer_id = ?`).get(customer.id)
  if (!existing) {
    db.prepare(`
      INSERT INTO conversations (customer_id, state, started_at, last_message_at)
      VALUES (?, 'MENU', ?, ?)
    `).run(customer.id, now, now)
  }

  return customer
}

/** Get customer by phone */
export function getCustomer(phone: string): Customer | undefined {
  return getDb().prepare(`SELECT * FROM customers WHERE phone = ?`).get(phone) as Customer | undefined
}

/** Get customer by ID */
export function getCustomerById(id: number): Customer | undefined {
  return getDb().prepare(`SELECT * FROM customers WHERE id = ?`).get(id) as Customer | undefined
}

/** Update customer name */
export function updateCustomerName(customerId: number, name: string): void {
  getDb().prepare(`UPDATE customers SET name = ? WHERE id = ?`).run(name, customerId)
}

/**
 * Auto-tag customer based on their lead score / order history.
 * Called automatically — no human needed.
 *   0–9   → New
 *   10–29 → Subscriber
 *   30–59 → Frequent
 *   60+   → VIP
 */
export function autoTagCustomer(customerId: number): void {
  const customer = getCustomerById(customerId)
  if (!customer) return

  const score = customer.lead_score || 0
  let tag = 'New'
  if (score >= 60) tag = 'VIP'
  else if (score >= 30) tag = 'Frequent'
  else if (score >= 10) tag = 'Subscriber'

  getDb().prepare(`UPDATE customers SET tags = ? WHERE id = ?`)
    .run(JSON.stringify([tag]), customerId)
}

/** Update customer language */
export function updateCustomerLanguage(customerId: number, language: string): void {
  getDb().prepare(`UPDATE customers SET language = ? WHERE id = ?`).run(language, customerId)
}

/** Get conversation state for a customer */
export function getConversation(customerId: number): Conversation | undefined {
  return getDb().prepare(`SELECT * FROM conversations WHERE customer_id = ?`).get(customerId) as Conversation | undefined
}

/** Set conversation state */
export function setState(customerId: number, state: ConversationState, context?: Record<string, unknown>): void {
  const db = getDb()
  const now = Date.now()
  const ctx = context ? JSON.stringify(context) : undefined

  if (ctx !== undefined) {
    db.prepare(`
      UPDATE conversations SET state = ?, context = ?, last_message_at = ? WHERE customer_id = ?
    `).run(state, ctx, now, customerId)
  } else {
    db.prepare(`
      UPDATE conversations SET state = ?, last_message_at = ? WHERE customer_id = ?
    `).run(state, now, customerId)
  }
}

/** Get conversation context (parsed JSON) */
export function getContext(customerId: number): Record<string, unknown> {
  const conv = getConversation(customerId)
  if (!conv?.context) return {}
  try {
    return JSON.parse(conv.context)
  } catch {
    return {}
  }
}

/** Update specific context key */
export function setContext(customerId: number, key: string, value: unknown): void {
  const current = getContext(customerId)
  current[key] = value
  setState(customerId, getConversation(customerId)?.state || 'MENU', current)
}

/** Update lead score */
export function updateLeadScore(customerId: number, delta: number): void {
  getDb().prepare(`
    UPDATE customers SET lead_score = MAX(0, lead_score + ?) WHERE id = ?
  `).run(delta, customerId)
}

/** Block a customer */
export function blockCustomer(customerId: number): void {
  getDb().prepare(`UPDATE customers SET is_blocked = 1 WHERE id = ?`).run(customerId)
}

/** Add a note to a lead */
export function addLeadNote(customerId: number, note: string, author = 'system'): void {
  getDb().prepare(`
    INSERT INTO lead_notes (customer_id, note, created_at, author)
    VALUES (?, ?, ?, ?)
  `).run(customerId, note, Date.now(), author)
}

/** Get all customers (for dashboard) */
export function listCustomers(limit = 100, offset = 0): Customer[] {
  return getDb().prepare(`
    SELECT * FROM customers
    ORDER BY last_seen DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as Customer[]
}

/** Get customer stats */
export function getCustomerStats(): { total: number; active_today: number; new_this_week: number } {
  const db = getDb()
  const total = (db.prepare(`SELECT COUNT(*) as c FROM customers`).get() as { c: number }).c
  const today = Date.now() - 86400000
  const week = Date.now() - 7 * 86400000
  const active_today = (db.prepare(`SELECT COUNT(*) as c FROM customers WHERE last_seen > ?`).get(today) as { c: number }).c
  const new_this_week = (db.prepare(`SELECT COUNT(*) as c FROM customers WHERE first_seen > ?`).get(week) as { c: number }).c
  return { total, active_today, new_this_week }
}

/** Search customers */
export function searchCustomers(query: string): Customer[] {
  const q = `%${query}%`
  return getDb().prepare(`
    SELECT * FROM customers
    WHERE phone LIKE ? OR name LIKE ? OR notes LIKE ?
    ORDER BY last_seen DESC
    LIMIT 50
  `).all(q, q, q) as Customer[]
}
