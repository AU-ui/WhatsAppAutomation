/**
 * Message Handler — Central router for all incoming WhatsApp messages.
 *
 * State Machine:
 *   MENU → AI_CHAT | BROWSING_CATALOG | HUMAN_HANDOFF
 *   BROWSING_CATALOG → BROWSING_CATEGORY → ORDERING → CHECKOUT
 *   AI_CHAT → (any state via commands)
 *   HUMAN_HANDOFF → MENU (when resolved)
 */

import { WASocket, proto } from '@whiskeysockets/baileys'
import { config } from '../config'
import { getDb, ConversationState } from '../database/db'
import { askClaude } from '../ai/claude'
import {
  upsertCustomer,
  getConversation,
  setState,
  getContext,
  setContext,
  updateLeadScore,
  updateCustomerName,
  autoTagCustomer,
} from '../features/crm/customerManager'
import {
  getCategories,
  getProductsByCategory,
  formatCatalogMenu,
  formatCategoryListing,
  addToCart,
  formatCart,
  clearCart,
  getProduct,
  searchProducts,
  formatProduct,
} from '../features/catalog/productManager'
import {
  placeOrder,
  formatOrderConfirmation,
  formatCustomerOrders,
  getOrder,
  formatOrder,
  getOrderWithItems,
} from '../features/catalog/orderManager'
import {
  initiateHandoff,
  getAvailableAgent,
  assignAgent,
  isCustomerInHandoff,
  isAgentInSession,
  getAgentPhoneForCustomer,
  getCustomerPhoneForAgent,
  getAgentByPhone,
  resolveHandoff,
} from '../features/handoff/agentManager'
import { logger } from '../utils/logger'

// Rate limiting: phone → [timestamp, count]
const rateLimits = new Map<string, { ts: number; count: number }>()

function isRateLimited(phone: string): boolean {
  const now = Date.now()
  const entry = rateLimits.get(phone)

  if (!entry || now - entry.ts > 60000) {
    rateLimits.set(phone, { ts: now, count: 1 })
    return false
  }

  if (entry.count >= config.bot.rateLimitPerMin) return true

  entry.count++
  return false
}

/** Extract text from any WhatsApp message type */
function extractText(message: proto.IWebMessageInfo): string {
  const msg = message.message
  if (!msg) return ''
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.templateButtonReplyMessage?.selectedId ||
    ''
  ).trim()
}

/** Get caller's "clean" phone number (strip @s.whatsapp.net) */
export function phoneFromJid(jid: string): string {
  return jid.split('@')[0]
}

/** Main handler — called for every incoming message */
export async function handleMessage(
  sock: WASocket,
  message: proto.IWebMessageInfo
): Promise<void> {
  const jid = message.key.remoteJid!
  const isGroup = jid.endsWith('@g.us')

  // Skip groups, status, and our own messages
  if (isGroup || jid === 'status@broadcast' || message.key.fromMe) return

  const text = extractText(message)
  if (!text) return // Ignore non-text messages (images without caption, etc.)

  const phone = phoneFromJid(jid)
  logger.info({ phone, text: text.substring(0, 80) }, 'Incoming message')

  // Rate limiting
  if (isRateLimited(phone)) {
    logger.warn({ phone }, 'Rate limited')
    return
  }

  // ── AGENT CHECK: is this message FROM an agent? ──
  const agent = getAgentByPhone(jid)
  if (agent) {
    await handleAgentMessage(sock, jid, text, agent)
    return
  }

  // ── CUSTOMER: upsert and get state ──
  const isNewCustomer = !getDb().prepare(`SELECT id FROM customers WHERE phone = ?`).get(jid)
  const customer = upsertCustomer(jid, undefined)
  if (customer.is_blocked) {
    logger.warn({ phone }, 'Blocked customer, ignoring')
    return
  }

  // Auto-tag based on current lead score on every interaction
  autoTagCustomer(customer.id)

  const conv = getConversation(customer.id)
  const state: ConversationState = (conv?.state as ConversationState) || 'MENU'

  // ── BRAND-NEW CUSTOMER: ask for name first ──
  if (isNewCustomer || (!customer.name && state !== 'REGISTERING')) {
    await setState(customer.id, 'REGISTERING')
    await sock.sendPresenceUpdate('composing', jid)
    await delay(config.bot.replyDelayMs)
    await send(sock, jid,
      `👋 Welcome to *${config.business.name}*!\n\n` +
      `I'm your automated assistant — available 24/7 to help you browse products, place orders, and answer questions.\n\n` +
      `To get started, what's your name? 😊`
    )
    return
  }

  // ── HANDOFF CHECK: customer currently with human agent? ──
  if (isCustomerInHandoff(jid)) {
    const agentPhone = getAgentPhoneForCustomer(jid)
    if (agentPhone) {
      // Forward customer message to agent
      await sock.sendMessage(agentPhone, {
        text: `[${customer.name || phone}]: ${text}`,
      })
    }
    return
  }

  // Simulate typing delay
  await sock.sendPresenceUpdate('composing', jid)
  await delay(config.bot.replyDelayMs)

  // ── GLOBAL COMMANDS (work in any state) ──
  const upper = text.toUpperCase().trim()

  if (upper === 'MENU' || upper === 'HI' || upper === 'HELLO' || upper === 'START') {
    await setState(customer.id, 'MENU')
    await send(sock, jid, buildMainMenu(customer.name))
    return
  }

  if (upper === 'CATALOG' || upper === 'PRODUCTS' || upper === 'SHOP') {
    await setState(customer.id, 'BROWSING_CATALOG')
    await send(sock, jid, formatCatalogMenu())
    return
  }

  if (upper === 'CART') {
    await send(sock, jid, formatCart(customer.id))
    return
  }

  if (upper === 'ORDERS' || upper === 'MY ORDERS') {
    await send(sock, jid, formatCustomerOrders(customer.id))
    return
  }

  if (upper === 'AGENT' || upper === 'HUMAN' || upper === 'SUPPORT') {
    await handleHandoffRequest(sock, jid, customer, 'Customer requested human agent')
    return
  }

  if (upper === 'CLEAR') {
    clearCart(customer.id)
    await send(sock, jid, `🗑️ Cart cleared!\n\nType *CATALOG* to browse products.`)
    return
  }

  // Opt-out from broadcast messages
  if (upper === 'STOP' || upper === 'UNSUBSCRIBE' || upper === 'OPT OUT') {
    const { optOut } = await import('../features/broadcast/broadcastManager')
    optOut(customer.id)
    await send(sock, jid, `✅ You've been unsubscribed from promotional messages.\n\nYou'll still receive order updates and support replies.\nType *START* anytime to re-subscribe.`)
    return
  }

  // Opt back in
  if (upper === 'START' || upper === 'SUBSCRIBE') {
    const { optIn } = await import('../features/broadcast/broadcastManager')
    optIn(customer.id)
    await send(sock, jid, `✅ You've re-subscribed to our updates and offers! 🎉\n\nType *MENU* to get started.`)
    return
  }

  if (upper === 'CHECKOUT') {
    await handleCheckout(sock, jid, customer)
    return
  }

  if (upper.startsWith('ORDER ')) {
    const orderId = parseInt(upper.replace('ORDER ', ''))
    if (!isNaN(orderId)) {
      const order = getOrderWithItems(orderId)
      if (order && order.customer_id === customer.id) {
        await send(sock, jid, formatOrder(order))
      } else {
        await send(sock, jid, `❌ Order not found. Type *ORDERS* to see your orders.`)
      }
      return
    }
  }

  // ── STATE-SPECIFIC ROUTING ──
  switch (state) {
    case 'REGISTERING':
      await handleRegistering(sock, jid, customer, text)
      break

    case 'MENU':
      await handleMenuState(sock, jid, customer, text)
      break

    case 'BROWSING_CATALOG':
      await handleCatalogBrowse(sock, jid, customer, text)
      break

    case 'BROWSING_CATEGORY':
      await handleCategoryBrowse(sock, jid, customer, text)
      break

    case 'ORDERING':
    case 'CHECKOUT':
      await handleCheckoutFlow(sock, jid, customer, text, state)
      break

    case 'AI_CHAT':
    default:
      await handleAiChat(sock, jid, customer, text)
      break
  }
}

// ─── State Handlers ───────────────────────────────────────────────

/** Brand-new customer: collect name, tag as New, send welcome offer, go to menu */
async function handleRegistering(
  sock: WASocket,
  jid: string,
  customer: { id: number; name: string | null; language: string },
  text: string
): Promise<void> {
  const name = text.trim().split(/\s+/).slice(0, 4).join(' ') // max 4 words
  if (name.length < 2) {
    await send(sock, jid, `Please share your name so I can assist you better 😊`)
    return
  }

  // Save name + tag as New customer
  updateCustomerName(customer.id, name)
  updateLeadScore(customer.id, 5)
  getDb().prepare(`UPDATE customers SET tags = ? WHERE id = ?`)
    .run(JSON.stringify(['New']), customer.id)

  await setState(customer.id, 'MENU')

  // Auto welcome offer — completely automatic, no human needed
  const welcomeMsg =
    `🎉 Welcome, *${name}*!\n\n` +
    `You've been registered with *${config.business.name}*.\n\n` +
    `🎁 *New Customer Offer:*\n` +
    `Enjoy *10% OFF* your first order! Just type *CATALOG* to start shopping.\n\n` +
    buildMainMenu(name)

  await send(sock, jid, welcomeMsg)
  logger.info({ phone: jid, name }, 'New customer registered via WhatsApp')
}

async function handleMenuState(
  sock: WASocket,
  jid: string,
  customer: { id: number; name: string | null; language: string },
  text: string
): Promise<void> {
  // Check if it's a menu number selection
  const num = parseInt(text)
  if (num === 1) {
    await setState(customer.id, 'BROWSING_CATALOG')
    await send(sock, jid, formatCatalogMenu())
  } else if (num === 2) {
    await send(sock, jid, formatCustomerOrders(customer.id))
  } else if (num === 3) {
    await setState(customer.id, 'AI_CHAT')
    await send(sock, jid, `🤖 *AI Assistant activated!*\n\nAsk me anything about our products, pricing, or services. I'm here to help!\n\n_Type *MENU* anytime to return to the main menu._`)
  } else if (num === 4) {
    await handleHandoffRequest(sock, jid, customer, 'Requested from menu')
  } else {
    // Route to AI for any natural language query
    await setState(customer.id, 'AI_CHAT')
    await handleAiChat(sock, jid, customer, text)
  }
}

async function handleCatalogBrowse(
  sock: WASocket,
  jid: string,
  customer: { id: number; name: string | null; language: string },
  text: string
): Promise<void> {
  const categories = getCategories()
  const num = parseInt(text)

  if (!isNaN(num) && num >= 1 && num <= categories.length) {
    const cat = categories[num - 1]
    await setState(customer.id, 'BROWSING_CATEGORY', { currentCategoryId: cat.id })
    await send(sock, jid, formatCategoryListing(cat.id))
  } else if (text.toLowerCase() === 'back' || text === '0') {
    await setState(customer.id, 'MENU')
    await send(sock, jid, buildMainMenu(customer.name))
  } else {
    // Search products
    const results = searchProducts(text)
    if (results.length > 0) {
      let msg = `🔍 *Search results for "${text}"*\n\n`
      results.forEach((p, i) => {
        msg += formatProduct(p, i + 1) + '\n'
      })
      msg += `\nReply with a product number to add to cart, or *BACK* to return.`
      await setState(customer.id, 'BROWSING_CATEGORY', { searchResults: results.map(p => p.id) })
      await send(sock, jid, msg)
    } else {
      await send(sock, jid, `🔍 No products found for "${text}".\n\n${formatCatalogMenu()}`)
    }
  }
}

async function handleCategoryBrowse(
  sock: WASocket,
  jid: string,
  customer: { id: number; name: string | null; language: string },
  text: string
): Promise<void> {
  const ctx = getContext(customer.id)
  const num = parseInt(text)

  if (!isNaN(num) && num >= 1) {
    // Get the product list from context
    let productId: number | undefined

    if (ctx.searchResults) {
      const ids = ctx.searchResults as number[]
      productId = ids[num - 1]
    } else if (ctx.currentCategoryId) {
      const products = getProductsByCategory(ctx.currentCategoryId as number)
      productId = products[num - 1]?.id
    }

    if (productId) {
      const product = getProduct(productId)
      if (product) {
        const result = addToCart(customer.id, productId)
        if (result === 'added' || result === 'updated') {
          updateLeadScore(customer.id, 5) // +5 points for showing purchase intent
          await send(sock, jid,
            `✅ *${product.name}* added to cart!\n\n` +
            `💰 ${product.currency} ${product.price.toFixed(2)}\n\n` +
            `Reply:\n*CART* — View cart\n*MORE* — Continue shopping\n*CHECKOUT* — Place order`
          )
        } else if (result === 'out_of_stock') {
          await send(sock, jid, `❌ Sorry, *${product.name}* is out of stock.\n\nType *BACK* to see other products.`)
        }
      }
    }
  } else if (text.toLowerCase() === 'back' || text === '0') {
    await setState(customer.id, 'BROWSING_CATALOG')
    await send(sock, jid, formatCatalogMenu())
  } else if (text.toLowerCase() === 'more') {
    if (ctx.currentCategoryId) {
      await send(sock, jid, formatCategoryListing(ctx.currentCategoryId as number))
    } else {
      await send(sock, jid, formatCatalogMenu())
    }
  } else {
    // Fall through to AI
    await handleAiChat(sock, jid, customer, text)
  }
}

async function handleCheckout(
  sock: WASocket,
  jid: string,
  customer: { id: number; name: string | null; language: string }
): Promise<void> {
  const { getCart } = await import('../features/catalog/productManager')
  const cartItems = getCart(customer.id)

  if (cartItems.length === 0) {
    await send(sock, jid, `🛒 Your cart is empty. Type *CATALOG* to browse products.`)
    return
  }

  await setState(customer.id, 'CHECKOUT')
  const cartMsg = formatCart(customer.id)
  await send(sock, jid,
    cartMsg + `\n\n─────────────────\n` +
    `✅ Type *CONFIRM* to place this order\n` +
    `✏️ Add a note (optional) or type *CONFIRM* to proceed`
  )
}

async function handleCheckoutFlow(
  sock: WASocket,
  jid: string,
  customer: { id: number; name: string | null; language: string },
  text: string,
  state: ConversationState
): Promise<void> {
  const upper = text.toUpperCase()

  if (upper === 'CONFIRM' || upper === 'YES' || upper === 'OK') {
    const ctx = getContext(customer.id)
    const order = placeOrder(customer.id, ctx.orderNote as string | undefined)

    if (order) {
      updateLeadScore(customer.id, 20) // +20 for completing an order
      await setState(customer.id, 'MENU')
      await send(sock, jid, formatOrderConfirmation(order))
    } else {
      await send(sock, jid, `❌ Something went wrong. Your cart may be empty. Type *CART* to check.`)
    }
  } else if (upper === 'CANCEL') {
    await setState(customer.id, 'MENU')
    await send(sock, jid, `❌ Order cancelled. Your cart is still saved. Type *CART* to review.`)
  } else {
    // Treat as an order note
    setContext(customer.id, 'orderNote', text)
    await send(sock, jid, `📝 Note added: "${text}"\n\nType *CONFIRM* to place your order, or *CANCEL* to go back.`)
  }
}

async function handleAiChat(
  sock: WASocket,
  jid: string,
  customer: { id: number; name: string | null; language: string },
  text: string
): Promise<void> {
  const ctx = getContext(customer.id)
  const cartItems = (await import('../features/catalog/productManager')).getCart(customer.id)

  let extraContext = ''
  if (cartItems.length > 0) {
    extraContext = `Customer has ${cartItems.length} item(s) in cart: ${cartItems.map(i => `${i.name} x${i.quantity}`).join(', ')}`
  }

  const response = await askClaude(customer.id, text, customer.language, extraContext)

  await send(sock, jid, response.text)

  if (response.requestsHandoff) {
    await handleHandoffRequest(sock, jid, customer, `AI suggested handoff after: "${text}"`)
  }
}

async function handleHandoffRequest(
  sock: WASocket,
  jid: string,
  customer: { id: number; name: string | null; language: string },
  reason: string
): Promise<void> {
  const availableAgent = getAvailableAgent()

  if (!availableAgent) {
    // No agents available
    const db = getDb()
    const noAgentMsg = (db.prepare(`SELECT value FROM bot_config WHERE key = 'handoff_no_agents'`).get() as { value: string } | undefined)?.value ||
      `😔 All our agents are busy right now. I've noted your request — someone will reach out soon!`
    await setState(customer.id, 'MENU')
    await send(sock, jid, noAgentMsg)
    initiateHandoff(customer.id, reason) // Still log it
    return
  }

  // Initiate handoff
  const handoff = initiateHandoff(customer.id, reason)
  assignAgent(handoff.id, availableAgent.id, jid)
  await setState(customer.id, 'HUMAN_HANDOFF')

  // Notify customer
  await send(sock, jid,
    `👤 Connecting you with *${availableAgent.name}*...\n\n` +
    `They'll be with you shortly. You can start typing your message now.\n\n` +
    `_Type *MENU* to disconnect from the agent and return to the bot._`
  )

  // Notify agent
  await send(sock, availableAgent.phone,
    `🔔 *New customer chat!*\n\n` +
    `Customer: ${customer.name || phoneFromJid(jid)}\n` +
    `Phone: ${phoneFromJid(jid)}\n` +
    `Reason: ${reason}\n\n` +
    `All messages from this customer will be forwarded here.\n` +
    `Type *END* when done to return them to the bot.`
  )

  logger.info({ customerId: customer.id, agentId: availableAgent.id }, 'Handoff connected')
}

/** Handle messages coming FROM an agent (routed to customer or parsed as commands) */
async function handleAgentMessage(
  sock: WASocket,
  agentJid: string,
  text: string,
  agent: { id: number; name: string; phone: string }
): Promise<void> {
  const upper = text.toUpperCase().trim()

  // END command — resolve handoff
  if (upper === 'END' || upper === 'DONE' || upper === '/END') {
    const customerPhone = resolveHandoff(agentJid)
    if (customerPhone) {
      await send(sock, customerPhone,
        `✅ Chat with *${agent.name}* has ended.\n\nIs there anything else I can help you with? Type *MENU* to see options.`
      )
      await send(sock, agentJid, `✅ Chat ended. Customer returned to bot.`)
      // Update agent state in DB
      const db = getDb()
      db.prepare(`UPDATE agents SET current_customer_id = NULL WHERE id = ?`).run(agent.id)
    } else {
      await send(sock, agentJid, `No active customer session found.`)
    }
    return
  }

  // STATUS command — show current session info
  if (upper === 'STATUS' || upper === '/STATUS') {
    const { getCustomerPhoneForAgent } = await import('../features/handoff/agentManager')
    const customerPhone = getCustomerPhoneForAgent(agentJid)
    if (customerPhone) {
      await send(sock, agentJid, `📊 *Current session*\nCustomer: ${phoneFromJid(customerPhone)}\n\nType *END* to close session.`)
    } else {
      await send(sock, agentJid, `No active customer session. You are available.`)
    }
    return
  }

  // Forward message to customer
  const { getCustomerPhoneForAgent } = await import('../features/handoff/agentManager')
  const customerPhone = getCustomerPhoneForAgent(agentJid)

  if (customerPhone) {
    await send(sock, customerPhone, text)
  } else {
    await send(sock, agentJid, `⚠️ No active customer session.\n\nAgent commands:\n*STATUS* — Check session\n*END* — Close session`)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

async function send(sock: WASocket, jid: string, text: string): Promise<void> {
  try {
    await sock.sendPresenceUpdate('paused', jid)
    await sock.sendMessage(jid, { text })
  } catch (err) {
    logger.error({ err, jid }, 'Failed to send message')
  }
}

function buildMainMenu(name: string | null): string {
  const greeting = name ? `👋 Hello, *${name}*!` : `👋 Hello!`
  return `${greeting}

Welcome to *${config.business.name}*!

What can I help you with today?

*1️⃣* 🛍️ Browse Products
*2️⃣* 📋 My Orders
*3️⃣* 🤖 Ask AI Assistant
*4️⃣* 👤 Talk to Human Agent

_Reply with a number, or just type your question!_`
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
