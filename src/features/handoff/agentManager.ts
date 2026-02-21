import { getDb, Agent, Handoff } from '../../database/db'
import { logger } from '../../utils/logger'

/**
 * In-memory routing maps for live handoff sessions.
 * These supplement the DB so we can route messages instantly.
 *
 * agentPhoneToCustomerPhone: when agent sends a message to the bot,
 *   we look up which customer they're serving.
 * customerPhoneToAgentPhone: when a customer sends a message while
 *   in handoff, we look up the agent to forward to.
 */
const agentToCustomer = new Map<string, string>() // agentPhone → customerPhone
const customerToAgent = new Map<string, string>() // customerPhone → agentPhone

// ---- Agent CRUD ----

export function listAgents(): Agent[] {
  return getDb().prepare(`SELECT * FROM agents ORDER BY active DESC, name`).all() as Agent[]
}

export function getAgentByPhone(phone: string): Agent | undefined {
  return getDb().prepare(`SELECT * FROM agents WHERE phone = ?`).get(phone) as Agent | undefined
}

export function getAgentById(id: number): Agent | undefined {
  return getDb().prepare(`SELECT * FROM agents WHERE id = ?`).get(id) as Agent | undefined
}

export function createAgent(name: string, phone: string): Agent {
  const db = getDb()
  db.prepare(`INSERT INTO agents (name, phone, active) VALUES (?, ?, 1)`).run(name, phone)
  return db.prepare(`SELECT * FROM agents WHERE phone = ?`).get(phone) as Agent
}

export function updateAgent(id: number, data: Partial<Agent>): void {
  const fields = Object.keys(data).filter(k => k !== 'id').map(k => `${k} = ?`).join(', ')
  const values = Object.entries(data).filter(([k]) => k !== 'id').map(([, v]) => v)
  getDb().prepare(`UPDATE agents SET ${fields} WHERE id = ?`).run(...values, id)
}

export function deleteAgent(id: number): void {
  getDb().prepare(`DELETE FROM agents WHERE id = ?`).run(id)
}

// ---- Handoff Logic ----

/** Get an available agent (active, not currently busy) */
export function getAvailableAgent(): Agent | undefined {
  return getDb().prepare(`
    SELECT * FROM agents
    WHERE active = 1 AND current_customer_id IS NULL
    ORDER BY last_active ASC NULLS FIRST
    LIMIT 1
  `).get() as Agent | undefined
}

/** Initiate a handoff request */
export function initiateHandoff(customerId: number, reason: string): Handoff {
  const db = getDb()
  const now = Date.now()

  // Close any existing open handoff
  db.prepare(`
    UPDATE handoffs SET status = 'resolved', resolved_at = ?
    WHERE customer_id = ? AND status IN ('pending', 'active')
  `).run(now, customerId)

  const result = db.prepare(`
    INSERT INTO handoffs (customer_id, reason, status, created_at)
    VALUES (?, ?, 'pending', ?)
  `).run(customerId, reason, now)

  logger.info({ customerId, reason }, 'Handoff initiated')
  return db.prepare(`SELECT * FROM handoffs WHERE id = ?`).get(result.lastInsertRowid) as Handoff
}

/** Assign an agent to a handoff */
export function assignAgent(handoffId: number, agentId: number, customerPhone: string): void {
  const db = getDb()
  const now = Date.now()
  const agent = getAgentById(agentId)
  if (!agent) return

  db.prepare(`UPDATE handoffs SET agent_id = ?, status = 'active' WHERE id = ?`).run(agentId, handoffId)
  db.prepare(`UPDATE agents SET current_customer_id = ?, last_active = ? WHERE id = ?`).run(
    getCustomerIdFromPhone(customerPhone), now, agentId
  )

  // Register in-memory routing
  agentToCustomer.set(agent.phone, customerPhone)
  customerToAgent.set(customerPhone, agent.phone)

  logger.info({ handoffId, agentId, customerPhone }, 'Agent assigned to handoff')
}

/** Resolve a handoff (agent done) */
export function resolveHandoff(agentPhone: string): string | null {
  const db = getDb()
  const agent = getAgentByPhone(agentPhone)
  if (!agent) return null

  const customerPhone = agentToCustomer.get(agentPhone)
  if (!customerPhone) return null

  const now = Date.now()
  db.prepare(`
    UPDATE handoffs SET status = 'resolved', resolved_at = ?
    WHERE agent_id = ? AND status = 'active'
  `).run(now, agent.id)

  db.prepare(`UPDATE agents SET current_customer_id = NULL WHERE id = ?`).run(agent.id)

  // Clean up routing maps
  agentToCustomer.delete(agentPhone)
  customerToAgent.delete(customerPhone)

  logger.info({ agentPhone, customerPhone }, 'Handoff resolved')
  return customerPhone
}

/** Check if a customer is currently in handoff */
export function isCustomerInHandoff(customerPhone: string): boolean {
  return customerToAgent.has(customerPhone)
}

/** Check if a phone belongs to an agent who is currently in a session */
export function isAgentInSession(agentPhone: string): boolean {
  return agentToCustomer.has(agentPhone)
}

/** Get the agent's phone for a customer in handoff */
export function getAgentPhoneForCustomer(customerPhone: string): string | undefined {
  return customerToAgent.get(customerPhone)
}

/** Get the customer's phone for an agent */
export function getCustomerPhoneForAgent(agentPhone: string): string | undefined {
  return agentToCustomer.get(agentPhone)
}

/** Register active sessions from DB on startup (persistence across restarts) */
export function restoreActiveHandoffs(): void {
  const db = getDb()
  const active = db.prepare(`
    SELECT h.*, a.phone as agent_phone, c.phone as customer_phone
    FROM handoffs h
    JOIN agents a ON a.id = h.agent_id
    JOIN customers c ON c.id = h.customer_id
    WHERE h.status = 'active'
  `).all() as Array<{ agent_phone: string; customer_phone: string }>

  for (const h of active) {
    agentToCustomer.set(h.agent_phone, h.customer_phone)
    customerToAgent.set(h.customer_phone, h.agent_phone)
  }

  if (active.length > 0) {
    logger.info({ count: active.length }, 'Restored active handoff sessions')
  }
}

/** Get active handoff for customer */
export function getActiveHandoff(customerId: number): Handoff | undefined {
  return getDb().prepare(`
    SELECT * FROM handoffs WHERE customer_id = ? AND status IN ('pending', 'active')
    ORDER BY created_at DESC LIMIT 1
  `).get(customerId) as Handoff | undefined
}

/** List all pending/active handoffs (for dashboard) */
export function listHandoffs(status?: string): Handoff[] {
  if (status) {
    return getDb().prepare(`SELECT * FROM handoffs WHERE status = ? ORDER BY created_at DESC`).all(status) as Handoff[]
  }
  return getDb().prepare(`SELECT * FROM handoffs ORDER BY created_at DESC LIMIT 100`).all() as Handoff[]
}

function getCustomerIdFromPhone(phone: string): number | null {
  const result = getDb().prepare(`SELECT id FROM customers WHERE phone = ?`).get(phone) as { id: number } | undefined
  return result?.id || null
}
