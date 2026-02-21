import { Router, Request, Response } from 'express'
import {
  getAllProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
  createCategory,
  searchProducts,
} from '../../features/catalog/productManager'
import { getDb } from '../../database/db'

const router = Router()

// ─── Categories ───────────────────────────────────────

// GET /api/products/categories
router.get('/categories', (_req: Request, res: Response) => {
  res.json({ success: true, data: getCategories() })
})

// POST /api/products/categories
router.post('/categories', (req: Request, res: Response) => {
  const { name, description, emoji, sort_order } = req.body
  if (!name) return res.status(400).json({ success: false, message: 'name is required' })
  const cat = createCategory({ name, description, emoji, sort_order })
  res.status(201).json({ success: true, data: cat })
})

// PATCH /api/products/categories/:id
router.patch('/categories/:id', (req: Request, res: Response) => {
  const { name, description, emoji, sort_order } = req.body
  const fields: string[] = []
  const values: unknown[] = []
  if (name) { fields.push('name = ?'); values.push(name) }
  if (description !== undefined) { fields.push('description = ?'); values.push(description) }
  if (emoji) { fields.push('emoji = ?'); values.push(emoji) }
  if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order) }
  if (fields.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' })
  values.push(parseInt(req.params.id))
  getDb().prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  res.json({ success: true, message: 'Category updated' })
})

// DELETE /api/products/categories/:id
router.delete('/categories/:id', (req: Request, res: Response) => {
  getDb().prepare(`DELETE FROM categories WHERE id = ?`).run(parseInt(req.params.id))
  res.json({ success: true, message: 'Category deleted' })
})

// ─── Products ─────────────────────────────────────────

// GET /api/products — list all (including inactive with ?all=true)
router.get('/', (req: Request, res: Response) => {
  const q = req.query.q as string
  if (q) return res.json({ success: true, data: searchProducts(q) })

  const showAll = req.query.all === 'true'
  const products = showAll
    ? getDb().prepare(`SELECT * FROM products ORDER BY category_id, sort_order`).all()
    : getAllProducts()
  res.json({ success: true, data: products })
})

// GET /api/products/:id
router.get('/:id', (req: Request, res: Response) => {
  const product = getProduct(parseInt(req.params.id))
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' })
  res.json({ success: true, data: product })
})

// POST /api/products
router.post('/', (req: Request, res: Response) => {
  const { name, description, price, currency, stock, category_id, sku, image_url, sort_order } = req.body
  if (!name || price === undefined) {
    return res.status(400).json({ success: false, message: 'name and price are required' })
  }
  const product = createProduct({ name, description, price, currency, stock, category_id, sku, image_url, sort_order })
  res.status(201).json({ success: true, data: product })
})

// PATCH /api/products/:id
router.patch('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const existing = getProduct(id)
  if (!existing) return res.status(404).json({ success: false, message: 'Product not found' })

  const allowed = ['name', 'description', 'price', 'currency', 'stock', 'category_id', 'sku', 'image_url', 'active', 'sort_order']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key]
  }
  updateProduct(id, updates)
  res.json({ success: true, data: getProduct(id) })
})

// DELETE /api/products/:id — soft delete (sets active=0)
router.delete('/:id', (req: Request, res: Response) => {
  deleteProduct(parseInt(req.params.id))
  res.json({ success: true, message: 'Product deactivated' })
})

// POST /api/products/:id/restore — re-activate
router.post('/:id/restore', (req: Request, res: Response) => {
  getDb().prepare(`UPDATE products SET active = 1 WHERE id = ?`).run(parseInt(req.params.id))
  res.json({ success: true, message: 'Product restored' })
})

export default router
