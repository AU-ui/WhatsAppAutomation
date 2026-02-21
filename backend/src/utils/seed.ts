/**
 * Database Seeder — Creates demo data for SQLite
 * Usage: npm run seed
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { initDatabase, getDb, generateId, toJson, nowIso } from '../database/sqlite'
import { config } from '../config'

async function seed() {
  console.log('🌱 Initializing SQLite database...')
  initDatabase()
  const db = getDb()
  console.log('✅ Database ready\n')

  // ── 1. Create super admin ──
  const existingAdmin = db.prepare('SELECT id FROM tenants WHERE email = ?').get(config.superAdmin.email)
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(config.superAdmin.password, 12)
    const id = generateId()
    const now = nowIso()

    db.prepare(`
      INSERT INTO tenants (id, businessName, businessType, email, password, role, isActive, whatsapp, subscription, settings, teamMembers, createdAt, updatedAt)
      VALUES (?, 'Platform Admin', 'general', ?, ?, 'superadmin', 1, ?, ?, ?, '[]', ?, ?)
    `).run(
      id, config.superAdmin.email, hashedPassword,
      toJson({ phoneNumberId: '', businessAccountId: '', accessToken: '', webhookVerifyToken: '', displayName: '', isVerified: false }),
      toJson({ plan: 'enterprise', status: 'active', messagesUsedThisMonth: 0, messagesResetAt: now }),
      toJson({ aiEnabled: true, brandTone: 'friendly', autoReplyEnabled: true }),
      now, now
    )
    console.log(`✅ Super admin created: ${config.superAdmin.email}`)
  } else {
    console.log(`ℹ️  Super admin already exists`)
  }

  // ── 2. Demo tenants ──
  const demoTenants = [
    { businessName: 'Grand Palace Hotel', businessType: 'hotel', email: 'hotel@demo.com', password: 'demo123', phone: '+971501234567', currency: 'AED', website: 'https://grandpalace.demo', address: 'Downtown Dubai, UAE' },
    { businessName: "Spice Garden Restaurant", businessType: 'restaurant', email: 'restaurant@demo.com', password: 'demo123', phone: '+919876543210', currency: 'INR', address: 'Mumbai, India' },
    { businessName: 'FreshMart Grocery', businessType: 'grocery', email: 'grocery@demo.com', password: 'demo123', currency: 'USD' },
    { businessName: 'Prime Properties', businessType: 'real_estate', email: 'realestate@demo.com', password: 'demo123', currency: 'AED' },
    { businessName: 'HealthFirst Clinic', businessType: 'clinic', email: 'clinic@demo.com', password: 'demo123', currency: 'USD' },
  ]

  for (const td of demoTenants) {
    const exists = db.prepare('SELECT id FROM tenants WHERE email = ?').get(td.email)
    if (!exists) {
      const hashedPassword = await bcrypt.hash(td.password, 12)
      const tenantId = generateId()
      const now = nowIso()

      db.prepare(`
        INSERT INTO tenants (id, businessName, businessType, email, password, phone, currency, website, address, role, isActive, whatsapp, subscription, settings, teamMembers, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'tenant', 1, ?, ?, ?, '[]', ?, ?)
      `).run(
        tenantId, td.businessName, td.businessType, td.email, hashedPassword,
        (td as Record<string, string>).phone || null,
        (td as Record<string, string>).currency || 'USD',
        (td as Record<string, string>).website || null,
        (td as Record<string, string>).address || null,
        toJson({ phoneNumberId: `DEMO_${td.businessType.toUpperCase()}`, businessAccountId: 'DEMO_WABA', accessToken: 'DEMO_TOKEN_REPLACE_WITH_REAL', webhookVerifyToken: 'demo_verify_token', displayName: td.businessName, isVerified: false }),
        toJson({ plan: 'pro', status: 'active', messagesUsedThisMonth: 0, messagesResetAt: now }),
        toJson({ aiEnabled: true, brandTone: 'friendly', autoReplyEnabled: true, welcomeMessage: `👋 Welcome to *${td.businessName}*! How can I help you today?` }),
        now, now
      )

      await seedProductsForTenant(tenantId, td.businessType, (td as Record<string, string>).currency || 'USD')
      await seedCustomersForTenant(tenantId)
      await seedAutoFlowsForTenant(tenantId, td.businessType)

      console.log(`✅ Demo tenant: ${td.businessName} (${td.email})`)
    }
  }

  console.log('\n🎉 Seeding complete!')
  console.log('\n📊 Demo Login Credentials:')
  console.log('─────────────────────────────────────')
  console.log(`Super Admin:  ${config.superAdmin.email} / ${config.superAdmin.password}`)
  console.log(`Hotel Demo:   hotel@demo.com / demo123`)
  console.log(`Restaurant:   restaurant@demo.com / demo123`)
  console.log(`Grocery:      grocery@demo.com / demo123`)
  console.log(`Real Estate:  realestate@demo.com / demo123`)
  console.log(`Clinic:       clinic@demo.com / demo123`)
  console.log('─────────────────────────────────────\n')
}

async function seedProductsForTenant(tenantId: string, businessType: string, currency: string) {
  const db = getDb()
  const typeProducts: Record<string, { categories: string[]; items: { name: string; price: number; type: string; desc: string }[] }> = {
    hotel: {
      categories: ['Rooms', 'Suites', 'Services'],
      items: [
        { name: 'Deluxe Room', price: 299, type: 'room', desc: 'Comfortable room with city view, king bed' },
        { name: 'Executive Suite', price: 599, type: 'room', desc: 'Spacious suite with panoramic views' },
        { name: 'Presidential Suite', price: 1299, type: 'room', desc: 'Ultimate luxury with private terrace' },
        { name: 'Airport Transfer', price: 49, type: 'service', desc: 'Private car to/from airport' },
        { name: 'Spa Package', price: 199, type: 'service', desc: 'Full-day spa with massage and facial' },
      ],
    },
    restaurant: {
      categories: ['Starters', 'Main Course', 'Beverages', 'Desserts'],
      items: [
        { name: 'Chicken Tikka', price: 12.99, type: 'menu_item', desc: 'Tender chicken marinated in spices' },
        { name: 'Butter Naan', price: 2.99, type: 'menu_item', desc: 'Freshly baked flatbread' },
        { name: 'Biryani Royale', price: 18.99, type: 'menu_item', desc: 'Fragrant rice with slow-cooked meat' },
        { name: 'Mango Lassi', price: 4.99, type: 'menu_item', desc: 'Refreshing yogurt drink with fresh mango' },
        { name: 'Gulab Jamun', price: 5.99, type: 'menu_item', desc: 'Milk-solid dumplings in rose syrup' },
      ],
    },
    grocery: {
      categories: ['Fresh Produce', 'Dairy', 'Bakery', 'Beverages'],
      items: [
        { name: 'Organic Milk (1L)', price: 2.49, type: 'product', desc: 'Farm-fresh organic whole milk' },
        { name: 'Sourdough Bread', price: 4.99, type: 'product', desc: 'Artisan sourdough loaf, baked fresh daily' },
        { name: 'Mixed Vegetables (1kg)', price: 3.99, type: 'product', desc: 'Seasonal mixed vegetables' },
        { name: 'Orange Juice (1L)', price: 3.49, type: 'product', desc: '100% fresh orange juice' },
        { name: 'Free Range Eggs (12)', price: 5.49, type: 'product', desc: 'Farm-fresh free range eggs' },
      ],
    },
    real_estate: {
      categories: ['Apartments', 'Villas', 'Commercial'],
      items: [
        { name: '2 BHK Apartment — Downtown', price: 1200000, type: 'property', desc: '2 bed, 2 bath, 1200 sq ft. Modern finish' },
        { name: '3 BHK Villa — Suburbs', price: 2500000, type: 'property', desc: '3 bed, 3000 sq ft. Private garden' },
        { name: 'Studio Apartment', price: 450000, type: 'property', desc: 'Cozy studio, 450 sq ft' },
        { name: 'Penthouse Suite', price: 5000000, type: 'property', desc: '4 BHK penthouse, panoramic views' },
      ],
    },
    clinic: {
      categories: ['General', 'Specialist', 'Diagnostics'],
      items: [
        { name: 'General Consultation', price: 50, type: 'service', desc: 'Visit with general physician — 30 min' },
        { name: 'Specialist Consultation', price: 120, type: 'service', desc: 'Visit with specialist — 45 min' },
        { name: 'Blood Test (Basic)', price: 35, type: 'service', desc: 'Complete blood count' },
        { name: 'Full Health Checkup', price: 250, type: 'service', desc: 'Comprehensive screening — 2 hours' },
      ],
    },
  }

  const typeData = typeProducts[businessType] || typeProducts.grocery
  const now = nowIso()

  // Insert categories
  const catIds: string[] = []
  for (const catName of typeData.categories) {
    const catId = generateId()
    db.prepare('INSERT INTO categories (id, tenantId, name, emoji, isActive, sortOrder, createdAt) VALUES (?, ?, ?, ?, 1, 0, ?)').run(catId, tenantId, catName, '📦', now)
    catIds.push(catId)
  }

  // Insert products
  typeData.items.forEach((item, i) => {
    db.prepare(`
      INSERT INTO products (id, tenantId, categoryId, name, description, price, discountedPrice, type, currency, stock, isActive, isFeatured, notifyOnAdd, tags, attributes, sortOrder, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, -1, 1, ?, 0, '[]', '{}', 0, ?, ?)
    `).run(
      generateId(), tenantId, catIds[i % catIds.length],
      item.name, item.desc, item.price,
      i === 0 ? item.price * 0.9 : null,
      item.type, currency,
      i === 0 ? 1 : 0,
      now, now
    )
  })
}

async function seedCustomersForTenant(tenantId: string) {
  const db = getDb()
  const sampleNames = ['Ahmed Al-Farsi', 'Priya Sharma', 'John Smith', 'Fatima Hassan', 'Liu Wei', 'Maria Garcia']
  const samplePhones = ['971501111111', '919876111111', '15551234567', '971502222222', '8612345678901', '3461234567']
  const now = nowIso()

  for (let i = 0; i < sampleNames.length; i++) {
    try {
      db.prepare(`
        INSERT INTO customers (id, tenantId, phone, name, optIn, tags, totalOrders, totalSpent, leadScore, firstSeenAt, lastMessageAt, createdAt)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        generateId(), tenantId, samplePhones[i], sampleNames[i],
        toJson(i === 0 ? ['vip', 'repeat_buyer'] : ['new']),
        i < 2 ? 5 : 1,
        i < 2 ? 500 + (i * 200) : 50,
        i < 2 ? 80 : 10,
        new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000).toISOString(),
        now, now
      )
    } catch {
      // Phone already exists for this tenant, skip
    }
  }
}

async function seedAutoFlowsForTenant(tenantId: string, businessType: string) {
  const db = getDb()
  const now = nowIso()

  const flows = [
    {
      name: 'Greeting Handler',
      category: 'onboarding',
      triggers: [{ keywords: ['hello', 'hi', 'hey', 'start'], exactMatch: false, caseSensitive: false }],
      actions: [{ id: 'a1', type: 'send_text', config: { text: `👋 Welcome! Type *MENU* to see all options!` } }],
    },
    {
      name: 'Discount Inquiry',
      category: 'marketing',
      triggers: [{ keywords: ['discount', 'offer', 'deal', 'promo', 'sale'], exactMatch: false, caseSensitive: false }],
      actions: [{ id: 'a1', type: 'send_text', config: { text: `🔥 *Special Offers!*\n\nType *OFFERS* to see all current discounts.\n\nNew customers get 10% OFF first order! 🎁` } }],
    },
    {
      name: 'Contact Info',
      category: 'support',
      triggers: [{ keywords: ['contact', 'call', 'phone', 'email', 'reach'], exactMatch: false, caseSensitive: false }],
      actions: [{ id: 'a1', type: 'send_text', config: { text: `📞 *Contact Us*\n\nReply to this chat anytime or type *AGENT* to speak with our team!` } }],
    },
  ]

  if (businessType === 'restaurant') {
    flows.push({
      name: 'Menu Request',
      category: 'product',
      triggers: [{ keywords: ['menu', 'food', 'eat', 'hungry', 'what do you have'], exactMatch: false, caseSensitive: false }],
      actions: [{ id: 'a1', type: 'send_text', config: { text: `🍽️ *Our Menu*\n\nType *CATALOG* to browse our full menu with prices!\nType *ORDER* to place your order!` } }],
    })
  }

  for (const flow of flows) {
    db.prepare(`
      INSERT INTO autoflows (id, tenantId, name, description, category, triggers, actions, isActive, triggerCount, createdAt, updatedAt)
      VALUES (?, ?, ?, NULL, ?, ?, ?, 1, 0, ?, ?)
    `).run(generateId(), tenantId, flow.name, flow.category, toJson(flow.triggers), toJson(flow.actions), now, now)
  }
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
