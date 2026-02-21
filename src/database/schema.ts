export const SCHEMA_SQL = `
-- ============================================================
-- WhatsApp SME Automation — Database Schema
-- ============================================================

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Customers (CRM)
CREATE TABLE IF NOT EXISTS customers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  phone           TEXT UNIQUE NOT NULL,
  name            TEXT,
  language        TEXT DEFAULT 'en',
  first_seen      INTEGER NOT NULL,
  last_seen       INTEGER NOT NULL,
  lead_score      INTEGER DEFAULT 0,
  tags            TEXT DEFAULT '[]',
  notes           TEXT,
  is_blocked      INTEGER DEFAULT 0,
  total_orders    INTEGER DEFAULT 0,
  total_spent     REAL DEFAULT 0
);

-- Conversation state per customer
CREATE TABLE IF NOT EXISTS conversations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id     INTEGER NOT NULL UNIQUE,
  state           TEXT DEFAULT 'MENU',
  context         TEXT DEFAULT '{}',
  started_at      INTEGER NOT NULL,
  last_message_at INTEGER NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Message history (for Claude context)
CREATE TABLE IF NOT EXISTS messages (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id       INTEGER NOT NULL,
  role              TEXT NOT NULL,
  content           TEXT NOT NULL,
  timestamp         INTEGER NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE INDEX IF NOT EXISTS idx_messages_customer ON messages(customer_id, timestamp DESC);

-- Product categories
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  emoji       TEXT DEFAULT '📦',
  sort_order  INTEGER DEFAULT 0
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER,
  name        TEXT NOT NULL,
  description TEXT,
  price       REAL NOT NULL,
  currency    TEXT DEFAULT 'USD',
  stock       INTEGER DEFAULT -1,
  image_url   TEXT,
  sku         TEXT,
  active      INTEGER DEFAULT 1,
  sort_order  INTEGER DEFAULT 0,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);

-- Shopping cart (temporary per customer)
CREATE TABLE IF NOT EXISTS cart_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  product_id  INTEGER NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  added_at    INTEGER NOT NULL,
  UNIQUE(customer_id, product_id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  status      TEXT DEFAULT 'pending',
  total       REAL NOT NULL,
  currency    TEXT DEFAULT 'USD',
  notes       TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Order items
CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL,
  product_id   INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  quantity     INTEGER NOT NULL,
  price        REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Human agents
CREATE TABLE IF NOT EXISTS agents (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT NOT NULL,
  phone               TEXT UNIQUE NOT NULL,
  active              INTEGER DEFAULT 1,
  current_customer_id INTEGER,
  last_active         INTEGER
);

-- Handoff sessions
CREATE TABLE IF NOT EXISTS handoffs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  agent_id    INTEGER,
  reason      TEXT,
  status      TEXT DEFAULT 'pending',
  created_at  INTEGER NOT NULL,
  resolved_at INTEGER,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);
CREATE INDEX IF NOT EXISTS idx_handoffs_status ON handoffs(status);

-- Bot configuration (key-value store)
CREATE TABLE IF NOT EXISTS bot_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Lead notes
CREATE TABLE IF NOT EXISTS lead_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  note        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  author      TEXT DEFAULT 'system',
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
`

export const DEFAULT_CONFIG: Record<string, string> = {
  welcome_message: `👋 Hello! Welcome to {BUSINESS_NAME}!

I'm your AI assistant, here to help you 24/7. What can I do for you today?

*1️⃣* Browse our products
*2️⃣* View my orders
*3️⃣* Ask a question
*4️⃣* Talk to a human agent

_Reply with a number or type your question!_`,
  away_message: `We're currently away, but I'll respond as soon as possible! Our hours are {BUSINESS_HOURS}.`,
  order_confirmation: `✅ Your order #{ORDER_ID} has been placed successfully!\n\nTotal: {CURRENCY}{TOTAL}\n\nWe'll contact you shortly to confirm. Thank you for shopping with us! 🎉`,
  handoff_waiting: `⏳ I'm connecting you to a human agent. Please wait a moment...\n\n_One of our team members will join shortly._`,
  handoff_no_agents: `😔 Sorry, all our agents are busy right now. I've noted your request and someone will reach out soon.\n\nIn the meantime, is there anything I can help you with?`,
}
