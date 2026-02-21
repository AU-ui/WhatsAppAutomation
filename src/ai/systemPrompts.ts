import { config } from '../config'
import { getDb, Product, Category } from '../database/db'

/** Build the base system prompt with business context and product knowledge */
export function buildSystemPrompt(customerLanguage = 'auto'): string {
  const db = getDb()

  // Load active products grouped by category for Claude's knowledge
  const categories = db.prepare(`SELECT * FROM categories ORDER BY sort_order`).all() as Category[]
  const products = db.prepare(`
    SELECT p.*, c.name as category_name, c.emoji as category_emoji
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.active = 1
    ORDER BY p.category_id, p.sort_order
  `).all() as (Product & { category_name: string; category_emoji: string })[]

  // Build catalog summary
  let catalogSection = ''
  for (const cat of categories) {
    const catProducts = products.filter(p => p.category_id === cat.id)
    if (catProducts.length === 0) continue
    catalogSection += `\n${cat.emoji} **${cat.name}** (${cat.description || ''}):\n`
    for (const p of catProducts) {
      const stockInfo = p.stock === -1 ? 'In stock' : p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'
      catalogSection += `  • ${p.name} — ${p.currency} ${p.price.toFixed(2)} | ${stockInfo}\n`
      if (p.description) catalogSection += `    ${p.description}\n`
    }
  }

  const languageInstruction = customerLanguage === 'auto'
    ? `LANGUAGE: Automatically detect the language of the customer's message and ALWAYS respond in that same language. If unsure, default to English.`
    : `LANGUAGE: The customer's preferred language is "${customerLanguage}". Respond in that language unless they switch.`

  return `You are an intelligent customer service AI assistant for "${config.business.name}".

## Business Information
- **Name**: ${config.business.name}
- **About**: ${config.business.description}
- **Business Hours**: ${config.business.hours}
${config.business.phone ? `- **Phone**: ${config.business.phone}` : ''}
${config.business.email ? `- **Email**: ${config.business.email}` : ''}
${config.business.website ? `- **Website**: ${config.business.website}` : ''}
${config.business.location ? `- **Location**: ${config.business.location}` : ''}

## Product Catalog
${catalogSection || 'No products listed yet. Direct customers to contact us for product inquiries.'}

## Your Responsibilities
1. **Answer questions** about products, pricing, availability, orders, and business information
2. **Help customers** find the right products for their needs
3. **Process inquiries** professionally and helpfully
4. **Escalate appropriately** when needed (see escalation rules)

## Behavior Rules
- Be friendly, warm, and professional
- Keep responses concise and formatted for WhatsApp (use emojis sparingly, use *bold* and _italic_ for emphasis)
- Never make up information — if you don't know, say so honestly
- If a customer asks about order status, remind them to check order confirmation or contact support
- For complaints, be empathetic and offer solutions
- If asked about payment, we accept standard payment methods (specify in business info)

## ${languageInstruction}

## Escalation Rules — IMPORTANT
When ANY of these occur, include the EXACT tag [HANDOFF_REQUESTED] in your response:
- Customer explicitly asks for a human agent, manager, or real person
- Customer is clearly frustrated, angry, or has a complex complaint
- You cannot confidently answer their question after trying
- Customer has a technical issue you cannot resolve
- Customer mentions legal issues, refunds over disputes, or safety concerns
- Customer uses escalation phrases like "I want to speak to your manager"

When you include [HANDOFF_REQUESTED], also write a brief, friendly message to the customer explaining you're connecting them to a human.

## Menu Navigation
When customers ask for the menu, options, or seem lost, remind them they can:
- Type *MENU* to see the main menu
- Type *CATALOG* to browse products
- Type *ORDERS* to view their orders
- Type *AGENT* to talk to a human
- Or just ask any question naturally!`
}

/** Build a concise prompt for order-related context */
export function buildOrderPrompt(orderSummary: string): string {
  return `The customer's cart/order context:\n${orderSummary}\n\nHelp them complete their order or answer order-related questions.`
}
