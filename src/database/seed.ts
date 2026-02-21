/**
 * Seed the database with sample data for testing.
 * Run: npm run seed
 */
import { getDb } from './db'
import { logger } from '../utils/logger'

const db = getDb()

function seed() {
  logger.info('Seeding database with sample data...')

  // Categories
  const insertCat = db.prepare(`
    INSERT OR IGNORE INTO categories (name, description, emoji, sort_order)
    VALUES (?, ?, ?, ?)
  `)
  const categories = [
    { name: 'Electronics', description: 'Gadgets and devices', emoji: '📱', order: 1 },
    { name: 'Clothing', description: 'Fashion and apparel', emoji: '👕', order: 2 },
    { name: 'Food & Beverages', description: 'Snacks and drinks', emoji: '🍔', order: 3 },
    { name: 'Services', description: 'Professional services', emoji: '🛠️', order: 4 },
  ]
  for (const c of categories) {
    insertCat.run(c.name, c.description, c.emoji, c.order)
  }

  // Products
  const insertProd = db.prepare(`
    INSERT OR IGNORE INTO products (category_id, name, description, price, currency, stock, sku, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const products = [
    [1, 'Wireless Earbuds Pro', 'Premium sound quality, 24hr battery, noise cancellation', 49.99, 'USD', 50, 'ELEC-001', 1],
    [1, 'Phone Case (Universal)', 'Shockproof, fits most smartphones', 9.99, 'USD', 200, 'ELEC-002', 2],
    [1, 'USB-C Fast Charger', '65W GaN charger with cable', 24.99, 'USD', 100, 'ELEC-003', 3],
    [2, 'Classic T-Shirt', '100% cotton, available in S/M/L/XL', 15.99, 'USD', -1, 'CLO-001', 1],
    [2, 'Denim Jeans', 'Slim fit, 5 colors available', 39.99, 'USD', 75, 'CLO-002', 2],
    [3, 'Energy Drink Pack (6x)', 'Natural energy boost, zero sugar', 12.99, 'USD', 500, 'FNB-001', 1],
    [3, 'Premium Coffee Blend', '500g arabica coffee, medium roast', 18.99, 'USD', 150, 'FNB-002', 2],
    [4, 'Tech Support (1hr)', 'Remote tech support session', 35.00, 'USD', -1, 'SVC-001', 1],
    [4, 'Logo Design', 'Professional logo with 3 revisions', 99.00, 'USD', -1, 'SVC-002', 2],
  ]
  for (const p of products) {
    insertProd.run(...p)
  }

  // Sample agent
  const insertAgent = db.prepare(`
    INSERT OR IGNORE INTO agents (name, phone, active) VALUES (?, ?, 1)
  `)
  insertAgent.run('Support Agent 1', '1234567890@s.whatsapp.net')

  logger.info('Seed complete! Sample products and agent added.')
  logger.info('Edit src/database/seed.ts to customize with your real products.')
}

seed()
process.exit(0)
