# Universal WhatsApp Automation Platform

> **Multi-tenant SaaS** — Meta WhatsApp Cloud API + MongoDB + OpenAI + React Dashboard

A production-ready platform for **all business types**: Hotels, Restaurants, Grocery, Real Estate, Clinics, Salons, E-commerce, SMEs, Agencies, and more.

---

## 🏗️ New Platform Architecture (v2.0)

```
├── backend/                  # Node.js + Express + MongoDB
│   └── src/
│       ├── config/           # Environment config & plan limits
│       ├── models/           # 11 MongoDB schemas
│       │   ├── Tenant.model.ts       Multi-tenant core model
│       │   ├── Customer.model.ts     CRM with tags & segmentation
│       │   ├── Message.model.ts      Full conversation history
│       │   ├── Product.model.ts      Products, menus, rooms, listings
│       │   ├── Order.model.ts        Orders, bookings, appointments
│       │   ├── Broadcast.model.ts    Campaigns & bulk messaging
│       │   ├── AutoFlow.model.ts     Keyword-triggered flows
│       │   ├── Template.model.ts     WhatsApp approved templates
│       │   ├── Analytics.model.ts    Daily aggregated metrics
│       │   └── CartItem.model.ts     Shopping cart
│       ├── services/
│       │   ├── whatsapp.service.ts   Meta Cloud API wrapper
│       │   ├── ai.service.ts         OpenAI GPT integration
│       │   ├── businessFlows.service.ts  Universal auto-reply engine
│       │   └── broadcast.service.ts  Bulk messaging engine
│       ├── controllers/      # 8 controllers
│       ├── routes/           # 10 REST API route files
│       ├── middleware/        # JWT auth + plan guards
│       ├── jobs/             # Node-cron scheduler (7 jobs)
│       └── utils/            # Logger + seed script
│
└── frontend/                 # React 18 + Vite + TailwindCSS
    └── src/
        ├── components/layout/ # Sidebar, Header, Layout
        ├── context/           # AuthContext
        ├── pages/             # 9 full dashboard pages
        │   ├── Dashboard.tsx  Live stats + charts
        │   ├── Customers.tsx  CRM with tags & messaging
        │   ├── Products.tsx   Catalog management
        │   ├── Orders.tsx     Order lifecycle management
        │   ├── Broadcasts.tsx Campaign builder
        │   ├── AutoFlows.tsx  Flow editor + template library
        │   ├── Analytics.tsx  Charts + conversion funnel
        │   ├── Settings.tsx   WhatsApp API + AI config
        │   └── Login.tsx
        └── services/api.ts   Axios client for all endpoints
```

---

## 🚀 Quick Start (New Platform)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# Fill in: MONGODB_URI, JWT_SECRET, META_VERIFY_TOKEN, OPENAI_API_KEY
npm run seed        # Creates demo tenants + sample data
npm run dev         # Starts on port 5000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev         # Starts on port 3000
```

### 3. Login

Open **http://localhost:3000** and use any demo account:

| Business | Email | Password |
|----------|-------|----------|
| Super Admin | admin@platform.com | admin123 |
| Hotel | hotel@demo.com | demo123 |
| Restaurant | restaurant@demo.com | demo123 |
| Grocery | grocery@demo.com | demo123 |
| Real Estate | realestate@demo.com | demo123 |
| Clinic | clinic@demo.com | demo123 |

---

## 📡 Meta WhatsApp Cloud API Setup

1. **developers.facebook.com** → Create App → Add WhatsApp Business
2. Copy **Phone Number ID** + generate **Permanent Access Token**
3. Set webhook URL: `https://yourdomain.com/api/webhook`
4. Subscribe to: `messages` field
5. Use your `META_VERIFY_TOKEN` as the verify token
6. In dashboard → **Settings → WhatsApp API** → enter credentials

---

## 🔑 Environment Variables

```env
PORT=5000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/whatsapp_platform
JWT_SECRET=your_64_char_random_secret
META_VERIFY_TOKEN=your_webhook_verify_token
META_APP_SECRET=your_app_secret
OPENAI_API_KEY=sk-...            # Optional: for AI replies
STRIPE_SECRET_KEY=sk_...         # Optional: for SaaS billing
```

---

## 🤖 Message Processing Pipeline

```
WhatsApp Message
     ↓
Validate Meta Signature
     ↓
Find Tenant by Phone Number ID
     ↓
Find/Create Customer
     ↓
Rate Limit Check (20 msg/min)
     ↓
Global Commands (MENU, CART, ORDERS, STOP...)
     ↓
Custom AutoFlow Engine (keyword matching)
     ↓
Business-Type Flow (hotel/restaurant/clinic/etc.)
     ↓
AI Fallback (OpenAI GPT with full context)
     ↓
Save to History + Update Analytics
```

---

## 🏢 Business Types Supported

| Type | Auto-Flows | Booking |
|------|-----------|---------|
| Hotel | rooms, tariff, amenities | Room reservation |
| Restaurant | menu, order, table | Table booking |
| Grocery | deals, catalog, delivery | Cart + checkout |
| Real Estate | listings, price, brochure | Site visit |
| Clinic | services, fees, doctor | Appointment |
| Salon | services, pricing, stylist | Appointment |
| Travel Agency | packages, quote, itinerary | Trip booking |
| Recruitment | jobs, apply, CV | Application |
| SME/General | catalog, offers, support | Cart + checkout |

---

## 💳 Subscription Plans

| Feature | Trial | Basic | Pro | Enterprise |
|---------|-------|-------|-----|------------|
| Messages/month | 100 | 1,000 | 10,000 | Unlimited |
| AI Replies | ❌ | ❌ | ✅ | ✅ |
| Custom Flows | ❌ | ❌ | ✅ | ✅ |
| Broadcasts/month | 1 | 5 | 30 | Unlimited |

---

## 📅 Scheduled Jobs

| Cron | Job |
|------|-----|
| Every 1 min | Run scheduled broadcasts |
| Every 1 hour | Abandoned cart + re-engagement triggers |
| Daily 9 AM | Appointment reminders (24h advance) |
| Daily 11 AM | Post-service feedback requests |
| Daily 1 AM | Expire trial subscriptions |
| Daily 8 AM | Auto-create festival campaigns |
| 1st of month | Reset message usage counters |

---

## 🚢 Deployment

### Render / Railway
```bash
cd backend && npm run build
# Build command: npm install && npm run build
# Start command: node dist/server.js
# Add all env vars from .env.example
```

### VPS with PM2
```bash
npm install -g pm2
cd backend && npm run build
pm2 start dist/server.js --name "wa-platform"
pm2 save && pm2 startup
```

---

## Legacy Version (v1 — Baileys + SQLite)

The original single-business bot using Baileys + SQLite + Claude AI is preserved in the root `src/` directory. See original README sections below for that version.

---


---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY and your business info

# 3. Seed sample products (optional)
npm run seed

# 4. Start the bot
npm run dev
```

On first run, a **QR code** appears in the terminal. Scan it with WhatsApp on your phone. The bot is now live.

---

## Project Structure

```
src/
├── index.ts                    ← Entry point
├── config.ts                   ← All env config
├── database/
│   ├── schema.ts               ← SQLite tables
│   ├── db.ts                   ← DB connection + types
│   └── seed.ts                 ← Sample data (npm run seed)
├── ai/
│   ├── claude.ts               ← Claude API integration (streaming)
│   └── systemPrompts.ts        ← Dynamic SME-aware system prompt
├── features/
│   ├── crm/customerManager.ts  ← Customer profiles, lead scoring
│   ├── catalog/
│   │   ├── productManager.ts   ← Products, categories, cart
│   │   └── orderManager.ts     ← Orders, checkout
│   ├── handoff/agentManager.ts ← Human agent routing
│   └── broadcast/
│       └── broadcastManager.ts ← Bulk messages, scheduler, templates
├── whatsapp/
│   ├── client.ts               ← Baileys connection, auto-reconnect
│   └── messageHandler.ts       ← State machine message router
├── dashboard/
│   ├── server.ts               ← Express REST API
│   └── routes/
│       ├── customers.ts
│       ├── products.ts
│       ├── orders.ts
│       ├── agents.ts
│       └── broadcasts.ts
└── utils/logger.ts
```

---

## Features

### 🤖 AI Auto-Reply (Claude Opus 4.6)
- Answers questions about products, pricing, hours in any language
- Detects when a human is needed and triggers automatic handoff
- Maintains full conversation history per customer

### 🛍️ Product Catalog & Ordering
- Customers browse categories and products via WhatsApp menus
- Add to cart → Checkout → Order confirmed (all in chat)
- Stock tracking, order history

### 👤 Human Handoff
- Customer types `AGENT` → bot finds available agent
- All messages forwarded bidirectionally (customer ↔ agent)
- Agent types `END` → bot resumes automatically

### 📢 Broadcast System
- Bulk message to All / VIP / Subscribers / Frequent buyers
- **Schedule** any broadcast for a future date/time
- Built-in festival templates: Diwali, Eid, Christmas, New Year, Weekend Sale, Flash Sale, New Product
- Low-stock alert to admin phone
- GDPR opt-out: customers type `STOP` to unsubscribe

### 👥 CRM / Lead Tracking
- Auto-creates customer profile on first message
- Language detection, lead score, tags, notes
- Full conversation history

### 🖥️ Admin REST API (port 3000)
All endpoints require header: `X-API-Key: <your DASHBOARD_SECRET>`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check (no auth) |
| GET | `/api/summary` | Revenue, customers, orders stats |
| GET/PATCH | `/api/config` | Bot message templates |
| GET | `/api/customers` | List customers (`?q=search`) |
| GET | `/api/customers/:id` | Customer + orders + messages |
| PATCH | `/api/customers/:id` | Update name/language/notes |
| POST | `/api/customers/:id/block` | Block a customer |
| GET | `/api/products` | List products |
| POST | `/api/products` | Add product |
| PATCH | `/api/products/:id` | Edit product |
| DELETE | `/api/products/:id` | Deactivate product |
| GET | `/api/orders` | List orders (`?status=pending`) |
| PATCH | `/api/orders/:id/status` | Update order status |
| GET | `/api/agents` | List human agents |
| POST | `/api/agents` | Register agent (`name` + `phone`) |
| GET | `/api/broadcasts` | List broadcasts |
| GET | `/api/broadcasts/templates` | List festival templates |
| POST | `/api/broadcasts` | Create broadcast |
| POST | `/api/broadcasts/from-template` | Create from template |
| POST | `/api/broadcasts/:id/send` | Send now |
| POST | `/api/broadcasts/:id/cancel` | Cancel scheduled |

---

## Customer Keywords (any state)

| Customer Types | Bot Does |
|---|---|
| `MENU` / `HI` / `HELLO` | Shows main menu |
| `CATALOG` / `PRODUCTS` | Product catalog |
| `CART` | View cart |
| `CHECKOUT` | Place order |
| `ORDERS` | Order history |
| `AGENT` / `HUMAN` | Connect to human agent |
| `CLEAR` | Empty cart |
| `STOP` / `UNSUBSCRIBE` | Opt out of broadcasts |
| `START` / `SUBSCRIBE` | Opt back in |
| Anything else | Claude AI answers |

---

## Human Agent Setup

1. Register agent via API:
```bash
curl -X POST http://localhost:3000/api/agents \
  -H "X-API-Key: your_secret" \
  -H "Content-Type: application/json" \
  -d '{"name": "Sarah", "phone": "447911123456"}'
```

2. When a customer requests an agent, Sarah's WhatsApp receives:
```
🔔 New customer chat!
Customer: John (+1234567890)
Reason: Customer requested human agent

All messages from this customer will be forwarded here.
Type END when done to return them to the bot.
```

3. Sarah replies normally — messages forwarded to customer.
4. Sarah types `END` → customer returned to bot.

---

## Broadcast Example

```bash
# Send Diwali offer to all customers
curl -X POST http://localhost:3000/api/broadcasts/from-template \
  -H "X-API-Key: your_secret" \
  -H "Content-Type: application/json" \
  -d '{"template_key": "diwali", "name": "Diwali 2025"}'

# Then send it
curl -X POST http://localhost:3000/api/broadcasts/1/send \
  -H "X-API-Key: your_secret"

# Or schedule for a specific time (unix ms)
curl -X POST http://localhost:3000/api/broadcasts \
  -H "X-API-Key: your_secret" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Year 2026",
    "message": "Happy New Year! Use code NY2026 for 10% off!",
    "target_tags": ["All"],
    "scheduled_at": 1767225600000
  }'
```

---

## Deploying to Production

### Option A — Render / Railway (Free tier)
1. Push to GitHub
2. Create new Web Service → connect repo
3. Set environment variables from `.env`
4. Build command: `npm install && npm run build`
5. Start command: `node dist/index.js`

> **Note:** Baileys needs persistent storage for `auth_info_baileys/`. Use a persistent disk on Render or Railway.

### Option B — VPS (Recommended for production)
```bash
# On your server
git clone <repo>
cd SME
npm install
cp .env.example .env && nano .env
npm run build
npm run seed

# Run with PM2 for auto-restart
npm install -g pm2
pm2 start dist/index.js --name "whatsapp-bot"
pm2 save && pm2 startup
```

---

## Upgrading to Meta Business API (Production Scale)

When you're ready to scale beyond Baileys:

1. Replace `@whiskeysockets/baileys` with Meta's Cloud API
2. Set up webhook at `https://yourdomain.com/webhook`
3. Update `src/whatsapp/client.ts` to use HTTP webhooks instead of QR
4. Get approved for WhatsApp Business API at business.whatsapp.com

The rest of the codebase (AI, CRM, orders, broadcasts) stays **unchanged**.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Your Claude API key |
| `BUSINESS_NAME` | ✅ | Your business name |
| `BUSINESS_DESCRIPTION` | ✅ | What you sell / do |
| `DASHBOARD_SECRET` | ✅ | Admin API password |
| `AI_MODEL` | — | Default: `claude-opus-4-6` |
| `DASHBOARD_PORT` | — | Default: `3000` |
| `REPLY_DELAY_MS` | — | Human-like delay, default `1000` |
| `HANDOFF_KEYWORDS` | — | Comma-separated words that trigger agent |
