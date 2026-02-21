import { Request, Response } from 'express'
import { getDb, generateId, nowIso, toJson, fromJson, parseProduct } from '../database/sqlite'
import { notifyNewProduct } from '../services/broadcast.service'

// ─── Categories ───────────────────────────────────────────────────

export async function getCategories(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM categories WHERE tenantId = ? AND isActive = 1 ORDER BY sortOrder ASC, name ASC').all(req.tenantId) as Record<string, unknown>[]
  const categories = rows.map(r => ({ ...r, _id: r.id, isActive: Boolean(r.isActive) }))
  res.json({ success: true, data: categories })
}

export async function createCategory(req: Request, res: Response): Promise<void> {
  const { name, description, emoji, imageUrl, sortOrder } = req.body
  const db = getDb()
  const id = generateId()
  db.prepare(`
    INSERT INTO categories (id, tenantId, name, description, emoji, imageUrl, sortOrder, isActive, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(id, req.tenantId, name, description || null, emoji || '📦', imageUrl || null, sortOrder || 0, nowIso())

  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Record<string, unknown>
  res.status(201).json({ success: true, data: { ...row, _id: row.id, isActive: Boolean(row.isActive) } })
}

export async function updateCategory(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const allowed = ['name', 'description', 'emoji', 'imageUrl', 'sortOrder']
  const sets: string[] = []
  const values: unknown[] = []
  for (const key of allowed) {
    if (req.body[key] !== undefined) { sets.push(`${key} = ?`); values.push(req.body[key]) }
  }
  if (sets.length === 0) { res.json({ success: true }); return }
  values.push(req.params.id, req.tenantId)
  const result = db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ? AND tenantId = ?`).run(...values)
  if (result.changes === 0) { res.status(404).json({ success: false, message: 'Category not found' }); return }
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json({ success: true, data: { ...row, _id: row.id, isActive: Boolean(row.isActive) } })
}

export async function deleteCategory(req: Request, res: Response): Promise<void> {
  getDb().prepare('UPDATE categories SET isActive = 0 WHERE id = ? AND tenantId = ?').run(req.params.id, req.tenantId)
  res.json({ success: true, message: 'Category deactivated' })
}

// ─── Products ─────────────────────────────────────────────────────

export async function getProducts(req: Request, res: Response): Promise<void> {
  const { page = 1, limit = 20, category, search, type, featured } = req.query
  const db = getDb()

  const conditions: string[] = ['p.tenantId = ?', 'p.isActive = 1']
  const params: unknown[] = [req.tenantId]

  if (category) { conditions.push('p.categoryId = ?'); params.push(category) }
  if (type) { conditions.push('p.type = ?'); params.push(type) }
  if (featured === 'true') { conditions.push('p.isFeatured = 1') }
  if (search) {
    conditions.push('(p.name LIKE ? OR p.description LIKE ?)')
    params.push(`%${search}%`, `%${search}%`)
  }

  const where = conditions.join(' AND ')
  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM products p WHERE ${where}`).get(...params) as { cnt: number }).cnt
  const offset = (Number(page) - 1) * Number(limit)
  const rows = db.prepare(`
    SELECT p.*, c.name as categoryName, c.emoji as categoryEmoji
    FROM products p
    LEFT JOIN categories c ON p.categoryId = c.id
    WHERE ${where}
    ORDER BY p.sortOrder ASC, p.createdAt DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset) as Record<string, unknown>[]

  const products = rows.map(r => {
    const p = parseProduct(r)!
    return { ...p, category: r.categoryName ? { id: r.categoryId, name: r.categoryName, emoji: r.categoryEmoji } : null }
  })

  res.json({
    success: true,
    data: products,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  })
}

export async function getProduct(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const row = db.prepare(`
    SELECT p.*, c.name as categoryName, c.emoji as categoryEmoji
    FROM products p
    LEFT JOIN categories c ON p.categoryId = c.id
    WHERE p.id = ? AND p.tenantId = ?
  `).get(req.params.id, req.tenantId) as Record<string, unknown> | undefined
  if (!row) { res.status(404).json({ success: false, message: 'Product not found' }); return }
  const p = parseProduct(row)!
  res.json({ success: true, data: { ...p, category: row.categoryName ? { id: row.categoryId, name: row.categoryName, emoji: row.categoryEmoji } : null } })
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const id = generateId()
  const now = nowIso()
  const {
    categoryId, name, description, price, discountedPrice, type, currency,
    stock, isFeatured, notifyOnAdd, imageUrl, pdfUrl, tags, attributes, sortOrder,
  } = req.body

  db.prepare(`
    INSERT INTO products (id, tenantId, categoryId, name, description, price, discountedPrice, type, currency, stock, isActive, isFeatured, notifyOnAdd, imageUrl, pdfUrl, tags, attributes, sortOrder, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.tenantId, categoryId || null, name, description || null,
    price || 0, discountedPrice || null, type || 'product',
    currency || 'USD', stock ?? -1,
    isFeatured ? 1 : 0, notifyOnAdd ? 1 : 0,
    imageUrl || null, pdfUrl || null,
    toJson(tags || []), toJson(attributes || {}),
    sortOrder || 0, now, now
  )

  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Record<string, unknown>
  const product = parseProduct(row)!

  // Auto-broadcast if configured
  if (product.notifyOnAdd) {
    const tenantRow = db.prepare('SELECT currency FROM tenants WHERE id = ?').get(req.tenantId) as { currency?: string }
    notifyNewProduct(
      String(req.tenantId),
      product.name as string,
      (product.description as string) || '',
      product.price as number,
      tenantRow?.currency || 'USD'
    ).catch(() => {})
  }

  res.status(201).json({ success: true, data: product })
}

export async function updateProduct(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const allowed = ['categoryId', 'name', 'description', 'price', 'discountedPrice', 'type', 'currency', 'stock', 'isFeatured', 'notifyOnAdd', 'imageUrl', 'pdfUrl', 'sortOrder']
  const jsonFields = ['tags', 'attributes']
  const sets: string[] = ['updatedAt = ?']
  const values: unknown[] = [nowIso()]

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      if (key === 'isFeatured' || key === 'notifyOnAdd') { sets.push(`${key} = ?`); values.push(req.body[key] ? 1 : 0) }
      else { sets.push(`${key} = ?`); values.push(req.body[key]) }
    }
  }
  for (const key of jsonFields) {
    if (req.body[key] !== undefined) { sets.push(`${key} = ?`); values.push(toJson(req.body[key])) }
  }

  values.push(req.params.id, req.tenantId)
  const result = db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ? AND tenantId = ?`).run(...values)
  if (result.changes === 0) { res.status(404).json({ success: false, message: 'Product not found' }); return }

  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json({ success: true, data: parseProduct(row) })
}

export async function deleteProduct(req: Request, res: Response): Promise<void> {
  getDb().prepare('UPDATE products SET isActive = 0, updatedAt = ? WHERE id = ? AND tenantId = ?').run(nowIso(), req.params.id, req.tenantId)
  res.json({ success: true, message: 'Product deactivated' })
}

export async function bulkUpdateStock(req: Request, res: Response): Promise<void> {
  const { updates } = req.body
  const db = getDb()
  const update = db.prepare('UPDATE products SET stock = ? WHERE id = ? AND tenantId = ?')
  for (const u of updates as { productId: string; stock: number }[]) {
    update.run(u.stock, u.productId, req.tenantId)
  }
  res.json({ success: true, message: `${updates.length} products updated` })
}
