import { Request, Response } from 'express'
import { getDb, generateId, nowIso, toJson, parseAutoFlow } from '../database/sqlite'
import { type BusinessType } from '../config'

export async function getAutoFlows(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM autoflows WHERE tenantId = ? ORDER BY isActive DESC, createdAt DESC').all(req.tenantId) as Record<string, unknown>[]
  res.json({ success: true, data: rows.map(r => parseAutoFlow(r)!) })
}

export async function getAutoFlow(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const row = db.prepare('SELECT * FROM autoflows WHERE id = ? AND tenantId = ?').get(req.params.id, req.tenantId) as Record<string, unknown> | undefined
  if (!row) { res.status(404).json({ success: false, message: 'Flow not found' }); return }
  res.json({ success: true, data: parseAutoFlow(row) })
}

export async function createAutoFlow(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const id = generateId()
  const now = nowIso()
  const { name, description, category, triggers, actions, isActive } = req.body

  db.prepare(`
    INSERT INTO autoflows (id, tenantId, name, description, category, triggers, actions, isActive, triggerCount, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(id, req.tenantId, name, description || null, category || 'custom', toJson(triggers || []), toJson(actions || []), isActive !== false ? 1 : 0, now, now)

  const row = db.prepare('SELECT * FROM autoflows WHERE id = ?').get(id) as Record<string, unknown>
  res.status(201).json({ success: true, data: parseAutoFlow(row) })
}

export async function updateAutoFlow(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const allowed = ['name', 'description', 'category']
  const jsonFields = ['triggers', 'actions']
  const sets: string[] = ['updatedAt = ?']
  const values: unknown[] = [nowIso()]

  for (const key of allowed) {
    if (req.body[key] !== undefined) { sets.push(`${key} = ?`); values.push(req.body[key]) }
  }
  for (const key of jsonFields) {
    if (req.body[key] !== undefined) { sets.push(`${key} = ?`); values.push(toJson(req.body[key])) }
  }
  if (req.body.isActive !== undefined) { sets.push('isActive = ?'); values.push(req.body.isActive ? 1 : 0) }

  values.push(req.params.id, req.tenantId)
  const result = db.prepare(`UPDATE autoflows SET ${sets.join(', ')} WHERE id = ? AND tenantId = ?`).run(...values)

  if (result.changes === 0) { res.status(404).json({ success: false, message: 'Flow not found' }); return }
  const row = db.prepare('SELECT * FROM autoflows WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json({ success: true, data: parseAutoFlow(row) })
}

export async function deleteAutoFlow(req: Request, res: Response): Promise<void> {
  getDb().prepare('DELETE FROM autoflows WHERE id = ? AND tenantId = ?').run(req.params.id, req.tenantId)
  res.json({ success: true, message: 'Flow deleted' })
}

export async function toggleAutoFlow(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const row = db.prepare('SELECT id, isActive FROM autoflows WHERE id = ? AND tenantId = ?').get(req.params.id, req.tenantId) as { id: string; isActive: number } | undefined
  if (!row) { res.status(404).json({ success: false, message: 'Flow not found' }); return }

  const newActive = row.isActive ? 0 : 1
  db.prepare('UPDATE autoflows SET isActive = ?, updatedAt = ? WHERE id = ?').run(newActive, nowIso(), row.id)
  res.json({ success: true, isActive: Boolean(newActive) })
}

export async function getDefaultFlows(req: Request, res: Response): Promise<void> {
  const { businessType } = req.query as { businessType?: BusinessType }
  const defaultFlows = getBuiltinFlows(businessType || 'general' as BusinessType)
  res.json({ success: true, data: defaultFlows })
}

function getBuiltinFlows(businessType: BusinessType) {
  const commonFlows = [
    {
      name: 'Greeting Handler',
      description: 'Responds to greetings and shows the main menu',
      category: 'onboarding',
      triggers: [{ keywords: ['hello', 'hi', 'hey', 'start', 'menu', 'home'], exactMatch: false, caseSensitive: false }],
      actions: [{ id: 'a1', type: 'send_text', config: { text: 'Welcome! How can I help you today? Type *MENU* to see all options.' } }],
    },
    {
      name: 'Discount Inquiry',
      description: 'Shows current offers and deals',
      category: 'marketing',
      triggers: [{ keywords: ['offer', 'discount', 'deal', 'promo', 'sale', 'coupon'], exactMatch: false, caseSensitive: false }],
      actions: [{ id: 'a1', type: 'send_text', config: { text: '🔥 Check out our current offers! Type *OFFERS* to see all active deals.' } }],
    },
    {
      name: 'Human Agent Request',
      description: 'Handles requests to speak with a human',
      category: 'support',
      triggers: [{ keywords: ['human', 'agent', 'person', 'manager', 'speak to', 'talk to'], exactMatch: false, caseSensitive: false }],
      actions: [{ id: 'a1', type: 'assign_agent', config: { message: 'Connecting you with our team...' } }],
    },
    {
      name: 'Hours Inquiry',
      description: 'Responds to business hours questions',
      category: 'support',
      triggers: [{ keywords: ['hours', 'timing', 'open', 'close', 'when'], exactMatch: false, caseSensitive: false }],
      actions: [{ id: 'a1', type: 'send_text', config: { text: 'Our business hours: Mon-Sat 9AM-6PM. Type CONTACT for our phone number!' } }],
    },
  ]

  const typeSpecific: Record<string, unknown[]> = {
    hotel: [
      {
        name: 'Room Availability',
        description: 'Show room types and pricing',
        category: 'product',
        triggers: [{ keywords: ['room', 'availability', 'available', 'rooms', 'accommodation'], exactMatch: false, caseSensitive: false }],
        actions: [{ id: 'a1', type: 'send_catalog', config: { productType: 'room' } }],
      },
    ],
    restaurant: [
      {
        name: 'Menu Request',
        description: 'Send restaurant menu',
        category: 'product',
        triggers: [{ keywords: ['menu', 'food', 'eat', 'what do you serve'], exactMatch: false, caseSensitive: false }],
        actions: [{ id: 'a1', type: 'send_catalog', config: { productType: 'menu_item' } }],
      },
    ],
  }

  return [...commonFlows, ...(typeSpecific[businessType] || [])]
}
