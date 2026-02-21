import { getDb, Order, OrderItem } from '../../database/db'
import { getCart, clearCart } from './productManager'
import { config } from '../../config'
import { logger } from '../../utils/logger'

export type OrderWithItems = Order & { items: OrderItem[]; customer_phone?: string; customer_name?: string }

/** Place an order from customer's cart */
export function placeOrder(customerId: number, notes?: string): Order | null {
  const db = getDb()
  const cartItems = getCart(customerId)

  if (cartItems.length === 0) return null

  const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0)
  const currency = cartItems[0]?.currency || config.business.currency
  const now = Date.now()

  const orderResult = db.prepare(`
    INSERT INTO orders (customer_id, status, total, currency, notes, created_at, updated_at)
    VALUES (?, 'confirmed', ?, ?, ?, ?, ?)
  `).run(customerId, total, currency, notes || null, now, now)

  const orderId = orderResult.lastInsertRowid as number

  // Insert order items
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, quantity, price)
    VALUES (?, ?, ?, ?, ?)
  `)

  for (const item of cartItems) {
    insertItem.run(orderId, item.product_id, item.name, item.quantity, item.price)

    // Decrement stock (if not unlimited)
    if (item.stock !== -1) {
      db.prepare(`UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?`).run(item.quantity, item.product_id)
    }
  }

  // Update customer stats
  db.prepare(`
    UPDATE customers
    SET total_orders = total_orders + 1,
        total_spent = total_spent + ?
    WHERE id = ?
  `).run(total, customerId)

  // Clear cart
  clearCart(customerId)

  logger.info({ orderId, customerId, total }, 'Order placed')
  return getOrder(orderId)
}

/** Get order by ID */
export function getOrder(orderId: number): Order | null {
  return getDb().prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId) as Order | null
}

/** Get order with items */
export function getOrderWithItems(orderId: number): OrderWithItems | null {
  const db = getDb()
  const order = db.prepare(`
    SELECT o.*, c.phone as customer_phone, c.name as customer_name
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    WHERE o.id = ?
  `).get(orderId) as OrderWithItems | null

  if (!order) return null

  order.items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(orderId) as OrderItem[]
  return order
}

/** Get all orders for a customer */
export function getCustomerOrders(customerId: number): OrderWithItems[] {
  const db = getDb()
  const orders = db.prepare(`
    SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC
  `).all(customerId) as Order[]

  return orders.map(o => {
    const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(o.id) as OrderItem[]
    return { ...o, items }
  })
}

/** Format a single order for WhatsApp */
export function formatOrder(order: OrderWithItems): string {
  const date = new Date(order.created_at).toLocaleDateString()
  const statusEmoji: Record<string, string> = {
    pending: '⏳',
    confirmed: '✅',
    processing: '🔄',
    shipped: '🚚',
    delivered: '📦',
    cancelled: '❌',
  }

  let msg = `📋 *Order #${order.id}*\n`
  msg += `📅 ${date}\n`
  msg += `${statusEmoji[order.status] || '📦'} Status: *${order.status.toUpperCase()}*\n\n`

  for (const item of order.items) {
    msg += `• ${item.product_name} x${item.quantity} — ${order.currency} ${(item.price * item.quantity).toFixed(2)}\n`
  }

  msg += `━━━━━━━━━━━━━━━\n`
  msg += `💳 *Total: ${order.currency} ${order.total.toFixed(2)}*`
  if (order.notes) msg += `\n📝 ${order.notes}`
  return msg
}

/** Format order confirmation */
export function formatOrderConfirmation(order: Order): string {
  const db = getDb()
  const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(order.id) as OrderItem[]

  let msg = `🎉 *Order Confirmed!*\n\n`
  msg += `Order #${order.id}\n\n`

  for (const item of items) {
    msg += `• ${item.product_name} x${item.quantity}\n`
  }

  msg += `\n💳 *Total: ${order.currency} ${order.total.toFixed(2)}*\n\n`
  msg += `We'll contact you shortly to arrange delivery/collection.\n`
  msg += `Thank you for your order! 🙏\n\n`
  msg += `_Type *ORDERS* anytime to check your order status._`
  return msg
}

/** List all orders for a customer (WhatsApp format) */
export function formatCustomerOrders(customerId: number): string {
  const orders = getCustomerOrders(customerId)

  if (orders.length === 0) {
    return `📭 You haven't placed any orders yet.\n\nType *CATALOG* to browse our products!`
  }

  let msg = `📋 *Your Orders*\n\n`
  for (const order of orders.slice(0, 5)) {
    const date = new Date(order.created_at).toLocaleDateString()
    msg += `*Order #${order.id}* — ${date}\n`
    msg += `Status: ${order.status.toUpperCase()} | Total: ${order.currency} ${order.total.toFixed(2)}\n`
    msg += `Items: ${order.items.map(i => i.product_name).join(', ')}\n\n`
  }

  if (orders.length > 5) {
    msg += `_Showing 5 most recent orders out of ${orders.length}_\n`
  }

  msg += `\nType *ORDER {number}* to see order details.`
  return msg
}

/** Update order status (admin) */
export function updateOrderStatus(orderId: number, status: string): void {
  getDb().prepare(`
    UPDATE orders SET status = ?, updated_at = ? WHERE id = ?
  `).run(status, Date.now(), orderId)
}

/** List all orders (for dashboard) */
export function listAllOrders(limit = 100, offset = 0, status?: string): OrderWithItems[] {
  const db = getDb()
  const query = status
    ? `SELECT o.*, c.phone as customer_phone, c.name as customer_name FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.status = ? ORDER BY o.created_at DESC LIMIT ? OFFSET ?`
    : `SELECT o.*, c.phone as customer_phone, c.name as customer_name FROM orders o JOIN customers c ON c.id = o.customer_id ORDER BY o.created_at DESC LIMIT ? OFFSET ?`

  const orders = (status ? db.prepare(query).all(status, limit, offset) : db.prepare(query).all(limit, offset)) as OrderWithItems[]

  return orders.map(o => {
    o.items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(o.id) as OrderItem[]
    return o
  })
}

/** Revenue stats */
export function getRevenueStats(): { total_revenue: number; total_orders: number; avg_order_value: number } {
  const db = getDb()
  const result = db.prepare(`
    SELECT
      COALESCE(SUM(total), 0) as total_revenue,
      COUNT(*) as total_orders,
      COALESCE(AVG(total), 0) as avg_order_value
    FROM orders WHERE status != 'cancelled'
  `).get() as { total_revenue: number; total_orders: number; avg_order_value: number }
  return result
}
