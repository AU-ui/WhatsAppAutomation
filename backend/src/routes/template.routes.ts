import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { getDb, generateId, nowIso, toJson, parseTemplate } from '../database/sqlite'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM templates WHERE tenantId = ? ORDER BY createdAt DESC').all(req.tenantId) as Record<string, unknown>[]
  res.json({ success: true, data: rows.map(r => parseTemplate(r)!) })
})

router.post('/', async (req, res) => {
  const db = getDb()
  const id = generateId()
  const now = nowIso()
  const { name, displayName, category, language, status, isPrebuilt, prebuiltType, components, variables } = req.body

  db.prepare(`
    INSERT INTO templates (id, tenantId, name, displayName, category, language, status, isPrebuilt, prebuiltType, components, variables, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.tenantId, name, displayName || null,
    category || 'MARKETING', language || 'en_US',
    status || 'pending', isPrebuilt ? 1 : 0,
    prebuiltType || null,
    toJson(components || []), toJson(variables || []),
    now, now
  )

  const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as Record<string, unknown>
  res.status(201).json({ success: true, data: parseTemplate(row) })
})

router.patch('/:id', async (req, res) => {
  const db = getDb()
  const allowed = ['name', 'displayName', 'category', 'language', 'status']
  const jsonFields = ['components', 'variables']
  const sets: string[] = ['updatedAt = ?']
  const values: unknown[] = [nowIso()]

  for (const key of allowed) {
    if (req.body[key] !== undefined) { sets.push(`${key} = ?`); values.push(req.body[key]) }
  }
  for (const key of jsonFields) {
    if (req.body[key] !== undefined) { sets.push(`${key} = ?`); values.push(toJson(req.body[key])) }
  }

  values.push(req.params.id, req.tenantId)
  const result = db.prepare(`UPDATE templates SET ${sets.join(', ')} WHERE id = ? AND tenantId = ?`).run(...values)
  if (result.changes === 0) { res.status(404).json({ success: false, message: 'Template not found' }); return }

  const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json({ success: true, data: parseTemplate(row) })
})

router.delete('/:id', async (req, res) => {
  getDb().prepare('DELETE FROM templates WHERE id = ? AND tenantId = ?').run(req.params.id, req.tenantId)
  res.json({ success: true, message: 'Template deleted' })
})

export default router
