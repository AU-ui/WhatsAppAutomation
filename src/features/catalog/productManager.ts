import { getDb, Product, Category, CartItem } from '../../database/db'
import { config } from '../../config'

/** Get all active categories */
export function getCategories(): Category[] {
  return getDb().prepare(`
    SELECT c.*, COUNT(p.id) as product_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id AND p.active = 1
    GROUP BY c.id
    ORDER BY c.sort_order
  `).all() as Category[]
}

/** Get products by category */
export function getProductsByCategory(categoryId: number): Product[] {
  return getDb().prepare(`
    SELECT * FROM products
    WHERE category_id = ? AND active = 1
    ORDER BY sort_order, name
  `).all(categoryId) as Product[]
}

/** Get all active products */
export function getAllProducts(): Product[] {
  return getDb().prepare(`
    SELECT * FROM products WHERE active = 1 ORDER BY category_id, sort_order
  `).all() as Product[]
}

/** Get product by ID */
export function getProduct(id: number): Product | undefined {
  return getDb().prepare(`SELECT * FROM products WHERE id = ?`).get(id) as Product | undefined
}

/** Search products */
export function searchProducts(query: string): Product[] {
  const q = `%${query}%`
  return getDb().prepare(`
    SELECT * FROM products
    WHERE active = 1 AND (name LIKE ? OR description LIKE ? OR sku LIKE ?)
    ORDER BY sort_order LIMIT 10
  `).all(q, q, q) as Product[]
}

/** Format a product for WhatsApp display */
export function formatProduct(product: Product, index?: number): string {
  const prefix = index !== undefined ? `*${index}.* ` : ''
  const stock = product.stock === -1 ? '✅ Available' : product.stock > 0 ? `✅ ${product.stock} left` : '❌ Out of stock'
  const price = `${product.currency} ${product.price.toFixed(2)}`

  return `${prefix}*${product.name}*\n` +
    `💰 ${price}  |  ${stock}\n` +
    (product.description ? `📝 ${product.description}\n` : '')
}

/** Format catalog menu */
export function formatCatalogMenu(): string {
  const categories = getCategories()
  if (categories.length === 0) {
    return `📭 Our catalog is being updated. Please check back soon or type *AGENT* to talk to us directly.`
  }

  let msg = `🛍️ *Our Product Catalog*\n\nChoose a category:\n\n`
  categories.forEach((cat, i) => {
    msg += `*${i + 1}.* ${cat.emoji} ${cat.name}\n`
  })
  msg += `\n_Reply with a number to browse that category_\n`
  msg += `_Or type a product name to search_`
  return msg
}

/** Format category listing */
export function formatCategoryListing(categoryId: number): string {
  const db = getDb()
  const cat = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(categoryId) as Category | undefined
  if (!cat) return `Category not found.`

  const products = getProductsByCategory(categoryId)
  if (products.length === 0) return `No products in ${cat.name} yet. Check back soon!`

  let msg = `${cat.emoji} *${cat.name}*\n\n`
  products.forEach((p, i) => {
    msg += formatProduct(p, i + 1) + '\n'
  })
  msg += `\n_Reply with a product number to add to cart_\n`
  msg += `_Type *BACK* to return to categories_`
  return msg
}

// ---- Cart Management ----

/** Add item to cart */
export function addToCart(customerId: number, productId: number, quantity = 1): 'added' | 'updated' | 'out_of_stock' | 'not_found' {
  const db = getDb()
  const product = getProduct(productId)
  if (!product) return 'not_found'
  if (product.stock === 0) return 'out_of_stock'

  const existing = db.prepare(`SELECT * FROM cart_items WHERE customer_id = ? AND product_id = ?`).get(customerId, productId) as CartItem | undefined

  if (existing) {
    db.prepare(`UPDATE cart_items SET quantity = quantity + ? WHERE customer_id = ? AND product_id = ?`).run(quantity, customerId, productId)
    return 'updated'
  } else {
    db.prepare(`INSERT INTO cart_items (customer_id, product_id, quantity, added_at) VALUES (?, ?, ?, ?)`).run(customerId, productId, quantity, Date.now())
    return 'added'
  }
}

/** Remove from cart */
export function removeFromCart(customerId: number, productId: number): void {
  getDb().prepare(`DELETE FROM cart_items WHERE customer_id = ? AND product_id = ?`).run(customerId, productId)
}

/** Get cart items with product details */
export function getCart(customerId: number): Array<CartItem & Product & { subtotal: number }> {
  return getDb().prepare(`
    SELECT ci.*, p.name, p.description, p.price, p.currency, p.stock, p.image_url,
           ci.quantity * p.price as subtotal
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.customer_id = ?
  `).all(customerId) as Array<CartItem & Product & { subtotal: number }>
}

/** Clear cart */
export function clearCart(customerId: number): void {
  getDb().prepare(`DELETE FROM cart_items WHERE customer_id = ?`).run(customerId)
}

/** Format cart for WhatsApp */
export function formatCart(customerId: number): string {
  const items = getCart(customerId)
  if (items.length === 0) {
    return `🛒 Your cart is empty.\n\nType *CATALOG* to browse products.`
  }

  let total = 0
  let msg = `🛒 *Your Cart*\n\n`
  items.forEach((item, i) => {
    msg += `*${i + 1}.* ${item.name}\n`
    msg += `   ${item.quantity}x ${item.currency} ${item.price.toFixed(2)} = *${item.currency} ${item.subtotal.toFixed(2)}*\n\n`
    total += item.subtotal
  })

  const currency = items[0]?.currency || config.business.currency
  msg += `━━━━━━━━━━━━━━━\n`
  msg += `💳 *Total: ${currency} ${total.toFixed(2)}*\n\n`
  msg += `Reply:\n*CHECKOUT* — Place order\n*CLEAR* — Empty cart\n*CATALOG* — Keep shopping`
  return msg
}

// ---- CRUD for dashboard ----

export function createProduct(data: Partial<Product>): Product {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO products (category_id, name, description, price, currency, stock, sku, active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(
    data.category_id || null,
    data.name || '',
    data.description || null,
    data.price || 0,
    data.currency || config.business.currency,
    data.stock ?? -1,
    data.sku || null,
    data.active ?? 1,
    data.sort_order || 0,
  )
  return getProduct(result.lastInsertRowid as number)!
}

export function updateProduct(id: number, data: Partial<Product>): void {
  const fields = Object.entries(data)
    .filter(([k]) => k !== 'id')
    .map(([k]) => `${k} = ?`)
    .join(', ')
  const values = Object.entries(data)
    .filter(([k]) => k !== 'id')
    .map(([, v]) => v)
  getDb().prepare(`UPDATE products SET ${fields} WHERE id = ?`).run(...values, id)
}

export function deleteProduct(id: number): void {
  getDb().prepare(`UPDATE products SET active = 0 WHERE id = ?`).run(id)
}

export function createCategory(data: Partial<Category>): Category {
  const db = getDb()
  const result = db.prepare(`
    INSERT INTO categories (name, description, emoji, sort_order)
    VALUES (?, ?, ?, ?)
  `).run(data.name || '', data.description || null, data.emoji || '📦', data.sort_order || 0)
  return db.prepare(`SELECT * FROM categories WHERE id = ?`).get(result.lastInsertRowid) as Category
}
