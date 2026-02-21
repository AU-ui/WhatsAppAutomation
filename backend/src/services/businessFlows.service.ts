/**
 * Business Flows Service — Universal Auto-Reply Engine
 *
 * Flow priority: Custom AutoFlows (from DB) → Business-type defaults → AI fallback
 */
import { getDb, fromJson, toJson, generateId, nowIso } from '../database/sqlite'
import { type BusinessType } from '../config'
import { logger } from '../utils/logger'
import type { TenantRecord } from '../middleware/auth.middleware'

export type SendFn = (to: string, message: string) => Promise<void>
export type SendImageFn = (to: string, imageUrl: string, caption?: string) => Promise<void>
export type SendDocFn = (to: string, docUrl: string, filename?: string, caption?: string) => Promise<void>

export interface FlowResult {
  handled: boolean
  newState?: string
  updatedContext?: Record<string, unknown>
  requestsHandoff?: boolean
  intent?: string
}

export interface FlowContext {
  tenant: TenantRecord
  customer: Record<string, unknown>
  phone: string
  text: string
  upperText: string
  send: SendFn
  sendImage?: SendImageFn
  sendDoc?: SendDocFn
  context: Record<string, unknown>
}

// ─── Main Entry Point ─────────────────────────────────────────────

export async function processBusinessFlow(ctx: FlowContext): Promise<FlowResult> {
  const customResult = await matchCustomAutoFlow(ctx)
  if (customResult.handled) return customResult

  const businessResult = await matchBusinessTypeFlow(ctx)
  if (businessResult.handled) return businessResult

  const globalResult = await matchGlobalKeywords(ctx)
  if (globalResult.handled) return globalResult

  return { handled: false }
}

// ─── Custom DB AutoFlows ──────────────────────────────────────────

async function matchCustomAutoFlow(ctx: FlowContext): Promise<FlowResult> {
  const { tenant, text } = ctx
  const db = getDb()

  const flows = db.prepare('SELECT * FROM autoflows WHERE tenantId = ? AND isActive = 1').all(tenant.id) as Record<string, unknown>[]

  for (const flowRow of flows) {
    const triggers = fromJson<Array<{ keywords: string[]; exactMatch: boolean; caseSensitive: boolean }>>(flowRow.triggers as string, [])
    const actions = fromJson<Array<{ type: string; config: Record<string, unknown>; label?: string }>>(flowRow.actions as string, [])

    for (const trigger of triggers) {
      const matched = trigger.keywords.some((kw) => {
        const keyword = trigger.caseSensitive ? kw : kw.toLowerCase()
        const message = trigger.caseSensitive ? text : text.toLowerCase()
        return trigger.exactMatch ? message === keyword : message.includes(keyword)
      })

      if (matched) {
        logger.debug({ flowId: flowRow.id, flowName: flowRow.name }, 'Custom flow triggered')

        if (actions.length > 0) {
          await executeFlowAction(actions[0], ctx)
        }

        db.prepare('UPDATE autoflows SET triggerCount = triggerCount + 1, lastTriggeredAt = ? WHERE id = ?').run(nowIso(), flowRow.id)

        return { handled: true, intent: `custom_flow_${flowRow.name}` }
      }
    }
  }

  return { handled: false }
}

async function executeFlowAction(
  action: { type: string; config: Record<string, unknown>; label?: string },
  ctx: FlowContext
): Promise<void> {
  const { send, sendImage, sendDoc, phone, tenant, customer } = ctx

  switch (action.type) {
    case 'send_text': {
      const text = replacePlaceholders(action.config.text as string, tenant, customer)
      await send(phone, text)
      break
    }
    case 'send_image':
      if (sendImage) await sendImage(phone, action.config.imageUrl as string, action.config.caption as string | undefined)
      break
    case 'send_document':
      if (sendDoc) await sendDoc(phone, action.config.documentUrl as string, action.config.filename as string | undefined, action.config.caption as string | undefined)
      break
    case 'send_catalog': {
      const catalog = await buildCatalogMessage(tenant.id)
      await send(phone, catalog)
      break
    }
    default:
      logger.debug({ type: action.type }, 'Unhandled flow action type')
  }
}

// ─── Global Keywords ──────────────────────────────────────────────

async function matchGlobalKeywords(ctx: FlowContext): Promise<FlowResult> {
  const { upperText, send, phone, tenant, customer } = ctx
  const db = getDb()

  if (/^(STOP|UNSUBSCRIBE|OPT.?OUT)$/.test(upperText)) {
    db.prepare('UPDATE customers SET optIn = 0, optOutAt = ? WHERE id = ?').run(nowIso(), customer.id)
    await send(phone, `✅ You've been unsubscribed from promotional messages.\n\nType *START* anytime to re-subscribe.`)
    return { handled: true, intent: 'opt_out' }
  }

  if (/^(START|SUBSCRIBE|OPT.?IN)$/.test(upperText)) {
    db.prepare('UPDATE customers SET optIn = 1 WHERE id = ?').run(customer.id)
    await send(phone, `✅ You've re-subscribed! 🎉\n\nType *MENU* to explore what we have for you.`)
    return { handled: true, intent: 'opt_in' }
  }

  if (upperText === 'ORDERS' || upperText === 'MY ORDERS' || upperText === 'ORDER STATUS') {
    const orders = db.prepare('SELECT * FROM orders WHERE tenantId = ? AND customerId = ? ORDER BY createdAt DESC LIMIT 5').all(tenant.id, customer.id) as Record<string, unknown>[]

    if (orders.length === 0) {
      await send(phone, `📋 You don't have any orders yet.\n\nType *CATALOG* to place your first order!`)
    } else {
      let msg = `📋 *Your Recent Orders*\n\n`
      for (const o of orders) {
        const items = fromJson<unknown[]>(o.items as string, [])
        const emoji = statusEmoji(o.status as string)
        const date = new Date(o.createdAt as string).toLocaleDateString()
        msg += `${emoji} *${o.orderNumber}*\n   Status: ${(o.status as string).toUpperCase()}\n   Total: ${o.currency} ${(o.total as number).toFixed(2)}\n   Date: ${date}\n\n`
      }
      msg += `_Type ORDER followed by order number for details_`
      await send(phone, msg)
    }
    return { handled: true, intent: 'order_status' }
  }

  const orderMatch = upperText.match(/^ORDER\s+(\S+)$/)
  if (orderMatch) {
    const orderNum = orderMatch[1]
    const order = db.prepare('SELECT * FROM orders WHERE tenantId = ? AND UPPER(orderNumber) LIKE ?').get(tenant.id, `%${orderNum}%`) as Record<string, unknown> | undefined

    if (order && String(order.customerId) === String(customer.id)) {
      const items = fromJson<Array<{ productName: string; quantity: number; subtotal: number }>>(order.items as string, [])
      const emoji = statusEmoji(order.status as string)
      let msg = `${emoji} *Order ${order.orderNumber}*\n\n📅 ${new Date(order.createdAt as string).toLocaleDateString()}\n📊 ${(order.status as string).toUpperCase()}\n💰 ${order.currency} ${(order.total as number).toFixed(2)}\n\n`
      if (items.length > 0) {
        msg += `*Items:*\n`
        items.forEach(item => { msg += `• ${item.productName} x${item.quantity} — ${order.currency} ${item.subtotal.toFixed(2)}\n` })
      }
      await send(phone, msg)
    } else {
      await send(phone, `❌ Order not found. Type *ORDERS* to see your orders.`)
    }
    return { handled: true, intent: 'order_lookup' }
  }

  if (upperText === 'CART' || upperText === 'MY CART' || upperText === 'VIEW CART') {
    const cartItems = db.prepare('SELECT * FROM cart_items WHERE tenantId = ? AND customerId = ?').all(tenant.id, customer.id) as Record<string, unknown>[]
    if (cartItems.length === 0) {
      await send(phone, `🛒 Your cart is empty.\n\nType *CATALOG* to browse our products.`)
    } else {
      let msg = `🛒 *Your Cart*\n\n`
      let total = 0
      cartItems.forEach((item, i) => {
        const subtotal = (item.price as number) * (item.quantity as number)
        total += subtotal
        msg += `${i + 1}. *${item.productName}*\n   ${item.quantity} × ${tenant.currency} ${(item.price as number).toFixed(2)} = ${tenant.currency} ${subtotal.toFixed(2)}\n`
      })
      msg += `\n─────────────────\n💰 *Total: ${tenant.currency} ${total.toFixed(2)}*\n\nType *CHECKOUT* to place your order\nType *CLEAR CART* to empty your cart`
      await send(phone, msg)
    }
    return { handled: true, intent: 'cart_view' }
  }

  if (upperText === 'CLEAR CART' || upperText === 'CLEAR') {
    db.prepare('DELETE FROM cart_items WHERE tenantId = ? AND customerId = ?').run(tenant.id, customer.id)
    await send(phone, `🗑️ Your cart has been cleared.\n\nType *CATALOG* to browse our products.`)
    return { handled: true, intent: 'cart_clear' }
  }

  if (/^(OFFERS?|DEALS?|DISCOUNTS?|PROMOTIONS?|PROMO)$/.test(upperText)) {
    const products = db.prepare('SELECT * FROM products WHERE tenantId = ? AND isActive = 1 AND discountedPrice IS NOT NULL AND discountedPrice > 0 LIMIT 8').all(tenant.id) as Record<string, unknown>[]
    if (products.length === 0) {
      await send(phone, `🎁 Check back soon for our latest offers!\n\nType *CATALOG* to see all products.`)
    } else {
      let msg = `🔥 *Current Offers & Deals*\n\n`
      products.forEach((p, i) => {
        const saving = (((p.price as number) - ((p.discountedPrice as number) || (p.price as number))) / (p.price as number) * 100).toFixed(0)
        msg += `${i + 1}. *${p.name}*\n   ~~${tenant.currency} ${(p.price as number).toFixed(2)}~~ → *${tenant.currency} ${((p.discountedPrice as number) || (p.price as number)).toFixed(2)}* (${saving}% OFF)\n\n`
      })
      msg += `_Offers valid while stocks last!_`
      await send(phone, msg)
    }
    return { handled: true, intent: 'discount_inquiry' }
  }

  if (/^(LOCATION|ADDRESS|WHERE|FIND US|DIRECTIONS?)$/.test(upperText)) {
    const addr = tenant.address || 'Address not configured'
    let msg = `📍 *Our Location*\n\n${addr}`
    if (tenant.website) msg += `\n\n🌐 ${tenant.website}`
    msg += `\n\nFor directions, simply share your location and we'll guide you!`
    await send(phone, msg)
    return { handled: true, intent: 'location_inquiry' }
  }

  if (/^(HOURS?|TIMING|TIMINGS?|OPEN|OPENING HOURS?)$/.test(upperText)) {
    const bhEnabled = (tenant.settings.businessHours as Record<string, unknown>)?.enabled
    if (bhEnabled) {
      const schedule = ((tenant.settings.businessHours as Record<string, unknown>)?.schedule as Array<{ day: string; open: string; close: string; closed: boolean }>) || []
      let msg = `🕐 *Business Hours*\n\n`
      for (const slot of schedule) {
        msg += slot.closed ? `*${slot.day}:* Closed\n` : `*${slot.day}:* ${slot.open} - ${slot.close}\n`
      }
      await send(phone, msg)
    } else {
      await send(phone, `🕐 Please contact us for our current business hours!\n\n📞 ${tenant.phone || ''}\n📧 ${tenant.email || ''}`)
    }
    return { handled: true, intent: 'hours_inquiry' }
  }

  if (/^(CONTACT|SUPPORT|HELP|PHONE|EMAIL|REACH)$/.test(upperText)) {
    let msg = `📞 *Contact ${tenant.businessName}*\n\n`
    if (tenant.phone) msg += `📱 Phone: ${tenant.phone}\n`
    if (tenant.email) msg += `📧 Email: ${tenant.email}\n`
    if (tenant.website) msg += `🌐 Website: ${tenant.website}\n`
    if (tenant.address) msg += `📍 Address: ${tenant.address}\n`
    msg += `\nOr type *AGENT* to chat with our team right now!`
    await send(phone, msg)
    return { handled: true, intent: 'contact_inquiry' }
  }

  return { handled: false }
}

// ─── Business-Type Specific Flows ────────────────────────────────

async function matchBusinessTypeFlow(ctx: FlowContext): Promise<FlowResult> {
  switch (ctx.tenant.businessType as BusinessType) {
    case 'hotel': return hotelFlow(ctx)
    case 'restaurant': return restaurantFlow(ctx)
    case 'grocery': return groceryFlow(ctx)
    case 'real_estate': return realEstateFlow(ctx)
    case 'clinic': return clinicFlow(ctx)
    case 'salon': return salonFlow(ctx)
    case 'agency_travel': return travelAgencyFlow(ctx)
    case 'agency_recruitment': return recruitmentFlow(ctx)
    default: return generalSmeFlow(ctx)
  }
}

async function hotelFlow(ctx: FlowContext): Promise<FlowResult> {
  const { upperText, send, phone, tenant } = ctx
  const db = getDb()

  if (/ROOM|ROOMS|AVAILABILITY|AVAILABLE/.test(upperText)) {
    const rooms = db.prepare('SELECT * FROM products WHERE tenantId = ? AND type = ? AND isActive = 1 LIMIT 6').all(tenant.id, 'room') as Record<string, unknown>[]
    let msg = `🏨 *Room Availability — ${tenant.businessName}*\n\n`
    if (rooms.length === 0) { msg += `Please contact us directly for room availability.` }
    else {
      rooms.forEach((r, i) => {
        const price = (r.discountedPrice as number) || (r.price as number)
        msg += `${i + 1}. *${r.name}*\n`
        if (r.description) msg += `   ${r.description}\n`
        msg += `   💰 From ${tenant.currency} ${price.toFixed(2)} / night\n\n`
      })
    }
    msg += `Type *BOOK* to make a reservation.`
    await send(phone, msg)
    return { handled: true, intent: 'room_availability', newState: 'BROWSING_CATALOG' }
  }

  if (/^(BOOK|BOOKING|RESERVE|RESERVATION|CHECK.?IN)/.test(upperText)) {
    await send(phone, `📅 *Room Booking — ${tenant.businessName}*\n\nPlease share:\n1️⃣ Check-in date (DD/MM/YYYY)\n2️⃣ Check-out date\n3️⃣ Number of guests\n4️⃣ Room type preference\n\nPlease reply with your check-in date to begin.`)
    return { handled: true, intent: 'booking_request', newState: 'BOOKING_CHECKIN' }
  }

  if (/TARIFF|PRICE|RATE|COST|HOW MUCH/.test(upperText)) {
    const rooms = db.prepare('SELECT * FROM products WHERE tenantId = ? AND type = ? AND isActive = 1').all(tenant.id, 'room') as Record<string, unknown>[]
    let msg = `💰 *Room Tariffs — ${tenant.businessName}*\n\n`
    rooms.forEach(r => { msg += `🛏️ *${r.name}*: ${tenant.currency} ${((r.discountedPrice as number) || (r.price as number)).toFixed(2)}/night\n` })
    if (rooms.length === 0) msg += `Please contact us for current rates.\n📞 ${tenant.phone || ''}`
    msg += `\n\nType *BOOK* to make a reservation!`
    await send(phone, msg)
    return { handled: true, intent: 'pricing_inquiry' }
  }

  return { handled: false }
}

async function restaurantFlow(ctx: FlowContext): Promise<FlowResult> {
  const { upperText, send, sendDoc, phone, tenant } = ctx
  const db = getDb()

  if (/^(MENU|FOOD MENU|SEE MENU|VIEW MENU)$/.test(upperText)) {
    const menuProduct = db.prepare('SELECT pdfUrl FROM products WHERE tenantId = ? AND pdfUrl IS NOT NULL AND pdfUrl != "" LIMIT 1').get(tenant.id) as { pdfUrl: string } | undefined
    if (menuProduct?.pdfUrl && sendDoc) {
      await send(phone, `📋 *Our Menu is here!*`)
      await sendDoc(phone, menuProduct.pdfUrl, 'Menu.pdf', `${tenant.businessName} Full Menu`)
    } else {
      const categories = db.prepare('SELECT * FROM categories WHERE tenantId = ? AND isActive = 1').all(tenant.id) as Record<string, unknown>[]
      let msg = `🍽️ *${tenant.businessName} Menu*\n\n`
      for (const cat of categories) {
        msg += `*${cat.emoji} ${cat.name}*\n`
        const items = db.prepare('SELECT * FROM products WHERE tenantId = ? AND categoryId = ? AND isActive = 1 LIMIT 5').all(tenant.id, cat.id) as Record<string, unknown>[]
        items.forEach(item => { msg += `   • ${item.name} — ${tenant.currency} ${((item.discountedPrice as number) || (item.price as number)).toFixed(2)}\n` })
        msg += `\n`
      }
      msg += `\nType *ORDER* to place your order!`
      await send(phone, msg)
    }
    return { handled: true, intent: 'menu_browse' }
  }

  if (/^(ORDER|FOOD ORDER|PLACE ORDER|TAKEAWAY|DELIVERY)$/.test(upperText)) {
    await send(phone, `🍱 *Place Your Order — ${tenant.businessName}*\n\n1️⃣ Type *MENU* to see our full menu\n2️⃣ Reply with items you'd like\n3️⃣ Mention if it's Dine-in, Takeaway, or Delivery\n\nOur team will confirm! 🕐`)
    return { handled: true, intent: 'order_start', newState: 'ORDERING' }
  }

  if (/^(TABLE|TABLE BOOKING|RESERVE TABLE|BOOK TABLE|DINE IN|RESERVATION)$/.test(upperText)) {
    await send(phone, `🍽️ *Table Reservation — ${tenant.businessName}*\n\nPlease share:\n📅 Date & Time\n👥 Number of guests\n📝 Special requests\n\nWe'll confirm within minutes!`)
    return { handled: true, intent: 'table_booking', newState: 'BOOKING_DATE' }
  }

  return { handled: false }
}

async function groceryFlow(ctx: FlowContext): Promise<FlowResult> {
  const { upperText, send, phone, tenant } = ctx
  const db = getDb()

  if (/^(DEALS?|TODAY.?S DEALS?|DAILY DEALS?)$/.test(upperText)) {
    const deals = db.prepare('SELECT * FROM products WHERE tenantId = ? AND isActive = 1 AND discountedPrice IS NOT NULL AND discountedPrice > 0 LIMIT 10').all(tenant.id) as Record<string, unknown>[]
    let msg = `🛒 *Today's Best Deals!*\n\n`
    if (deals.length === 0) { msg += `Check back soon for amazing deals!` }
    else { deals.forEach((d, i) => { msg += `${i + 1}. *${d.name}*\n   ~~${tenant.currency} ${(d.price as number).toFixed(2)}~~ → *${tenant.currency} ${((d.discountedPrice as number) || (d.price as number)).toFixed(2)}*\n\n` }) }
    msg += `Type *CATALOG* to browse all products.`
    await send(phone, msg)
    return { handled: true, intent: 'deals_browse' }
  }

  if (/^(ORDER GROCERIES?|GROCERY ORDER|SHOP|SHOPPING)$/.test(upperText)) {
    const catalog = await buildCatalogMessage(tenant.id)
    await send(phone, catalog)
    return { handled: true, intent: 'grocery_order', newState: 'BROWSING_CATALOG' }
  }

  return { handled: false }
}

async function realEstateFlow(ctx: FlowContext): Promise<FlowResult> {
  const { upperText, send, phone, tenant } = ctx
  const db = getDb()

  if (/^(PROPERTIES|LISTINGS|PROPERTY|FLATS?|HOUSES?|APARTMENTS?|VILLAS?)$/.test(upperText)) {
    const properties = db.prepare('SELECT * FROM products WHERE tenantId = ? AND type = ? AND isActive = 1 LIMIT 6').all(tenant.id, 'property') as Record<string, unknown>[]
    let msg = `🏠 *Properties — ${tenant.businessName}*\n\n`
    if (properties.length === 0) { msg += `Contact us for the latest listings!` }
    else {
      properties.forEach((p, i) => {
        msg += `${i + 1}. *${p.name}*\n`
        if (p.description) msg += `   ${(p.description as string).substring(0, 100)}\n`
        msg += `   💰 ${tenant.currency} ${((p.discountedPrice as number) || (p.price as number)).toLocaleString()}\n\n`
      })
    }
    msg += `Type *VISIT* to schedule a site visit.`
    await send(phone, msg)
    return { handled: true, intent: 'property_browse' }
  }

  if (/^(SITE VISIT|VISIT|SCHEDULE VISIT|VIEWING|APPOINTMENT)$/.test(upperText)) {
    await send(phone, `🏗️ *Schedule a Site Visit — ${tenant.businessName}*\n\nPlease share:\n📅 Preferred date & time\n🏠 Property you're interested in\n\nOur property advisor will call you to confirm!`)
    return { handled: true, intent: 'site_visit_booking', newState: 'BOOKING_DATE' }
  }

  return { handled: false }
}

async function clinicFlow(ctx: FlowContext): Promise<FlowResult> {
  const { upperText, send, phone, tenant } = ctx
  const db = getDb()

  if (/^(APPOINTMENT|BOOK|SCHEDULE|CONSULT|CONSULTATION|DOCTOR)$/.test(upperText)) {
    const services = db.prepare('SELECT * FROM products WHERE tenantId = ? AND isActive = 1 LIMIT 8').all(tenant.id) as Record<string, unknown>[]
    let msg = `🏥 *Book an Appointment — ${tenant.businessName}*\n\n`
    if (services.length > 0) {
      services.forEach((s, i) => { msg += `${i + 1}. ${s.name} — ${tenant.currency} ${((s.discountedPrice as number) || (s.price as number)).toFixed(2)}\n` })
      msg += `\n`
    }
    msg += `Please share:\n📅 Preferred date & time\n🩺 Type of consultation\n\nWe'll confirm shortly!`
    await send(phone, msg)
    return { handled: true, intent: 'appointment_booking', newState: 'BOOKING_DATE' }
  }

  if (/^(SERVICES?|TREATMENTS?|SPECIALTIES?)$/.test(upperText)) {
    const services = db.prepare('SELECT * FROM products WHERE tenantId = ? AND type = ? AND isActive = 1').all(tenant.id, 'service') as Record<string, unknown>[]
    let msg = `🏥 *Our Services — ${tenant.businessName}*\n\n`
    services.forEach((s, i) => {
      msg += `${i + 1}. *${s.name}*\n`
      if (s.description) msg += `   ${s.description}\n`
      msg += `   💰 ${tenant.currency} ${((s.discountedPrice as number) || (s.price as number)).toFixed(2)}\n\n`
    })
    msg += `Type *APPOINTMENT* to book a consultation.`
    await send(phone, msg)
    return { handled: true, intent: 'services_browse' }
  }

  return { handled: false }
}

async function salonFlow(ctx: FlowContext): Promise<FlowResult> {
  const { upperText, send, phone, tenant } = ctx
  const db = getDb()

  if (/^(SERVICES?|TREATMENTS?|HAIR|NAILS|SPA|WHAT DO YOU OFFER)$/.test(upperText)) {
    const categories = db.prepare('SELECT * FROM categories WHERE tenantId = ? AND isActive = 1').all(tenant.id) as Record<string, unknown>[]
    let msg = `💅 *Services — ${tenant.businessName}*\n\n`
    for (const cat of categories) {
      msg += `*${(cat.emoji as string) || '✨'} ${cat.name}*\n`
      const services = db.prepare('SELECT * FROM products WHERE tenantId = ? AND categoryId = ? AND isActive = 1 LIMIT 5').all(tenant.id, cat.id) as Record<string, unknown>[]
      services.forEach(s => { msg += `   • ${s.name} — ${tenant.currency} ${((s.discountedPrice as number) || (s.price as number)).toFixed(2)}\n` })
      msg += `\n`
    }
    msg += `Type *BOOK* to schedule an appointment!`
    await send(phone, msg)
    return { handled: true, intent: 'services_browse' }
  }

  if (/^(BOOK|APPOINTMENT|SCHEDULE|STYLIST|AVAILABLE)$/.test(upperText)) {
    await send(phone, `💇 *Book an Appointment — ${tenant.businessName}*\n\nPlease share:\n📅 Preferred date & time\n💅 Service(s) you'd like\n\nWe'll confirm your slot! ✨`)
    return { handled: true, intent: 'appointment_booking', newState: 'BOOKING_DATE' }
  }

  return { handled: false }
}

async function travelAgencyFlow(ctx: FlowContext): Promise<FlowResult> {
  const { upperText, send, phone, tenant } = ctx
  const db = getDb()

  if (/^(PACKAGES?|TOURS?|DESTINATIONS?|TRIPS?)$/.test(upperText)) {
    const packages = db.prepare('SELECT * FROM products WHERE tenantId = ? AND isActive = 1 AND type = ? LIMIT 8').all(tenant.id, 'package') as Record<string, unknown>[]
    let msg = `✈️ *Travel Packages — ${tenant.businessName}*\n\n`
    if (packages.length > 0) {
      packages.forEach((p, i) => {
        msg += `${i + 1}. *${p.name}*\n`
        if (p.description) msg += `   ${(p.description as string).substring(0, 100)}\n`
        msg += `   💰 From ${tenant.currency} ${((p.discountedPrice as number) || (p.price as number)).toLocaleString()}\n\n`
      })
    } else { msg += `Contact us for custom travel packages!\n📞 ${tenant.phone || ''}` }
    msg += `\nType *BOOK* to enquire!`
    await send(phone, msg)
    return { handled: true, intent: 'packages_browse' }
  }

  if (/^(BOOK|ENQUIRE|QUOTE|BOOKING)$/.test(upperText)) {
    await send(phone, `✈️ *Travel Booking — ${tenant.businessName}*\n\nTell us about your trip:\n📍 Destination\n📅 Travel dates\n👥 Number of travellers\n💰 Budget range\n\nOur travel expert will create a personalized itinerary! 🌍`)
    return { handled: true, intent: 'booking_enquiry', newState: 'AI_CHAT' }
  }

  return { handled: false }
}

async function recruitmentFlow(ctx: FlowContext): Promise<FlowResult> {
  const { upperText, send, phone, tenant } = ctx
  const db = getDb()

  if (/^(JOBS?|VACANCIES|OPENINGS?|POSITIONS?|HIRING)$/.test(upperText)) {
    const jobs = db.prepare('SELECT * FROM products WHERE tenantId = ? AND isActive = 1 LIMIT 8').all(tenant.id) as Record<string, unknown>[]
    let msg = `💼 *Current Job Openings — ${tenant.businessName}*\n\n`
    if (jobs.length > 0) {
      jobs.forEach((j, i) => {
        msg += `${i + 1}. *${j.name}*\n`
        if (j.description) msg += `   ${(j.description as string).substring(0, 100)}\n\n`
      })
    } else { msg += `Check back soon for new openings!\n\nSend us your CV to be considered for future roles.` }
    msg += `\nType *APPLY* to submit your application!`
    await send(phone, msg)
    return { handled: true, intent: 'jobs_browse' }
  }

  if (/^(APPLY|APPLICATION|CV|RESUME)$/.test(upperText)) {
    await send(phone, `📋 *Apply — ${tenant.businessName}*\n\nPlease share:\n👤 Full name\n💼 Position applying for\n📧 Email address\n\nOr send your CV as a document!`)
    return { handled: true, intent: 'job_application', newState: 'AI_CHAT' }
  }

  return { handled: false }
}

async function generalSmeFlow(ctx: FlowContext): Promise<FlowResult> {
  const { upperText, send, phone, tenant } = ctx
  const db = getDb()

  if (/^(CATALOG|CATALOGUE|PRODUCTS?|SERVICES?|SHOP|BROWSE|MENU)$/.test(upperText)) {
    const catalog = await buildCatalogMessage(tenant.id)
    await send(phone, catalog)
    return { handled: true, intent: 'catalog_browse', newState: 'BROWSING_CATALOG' }
  }

  if (/^(NEW|NEW ARRIVALS?|LATEST|WHAT.?S NEW|NEW PRODUCTS?)$/.test(upperText)) {
    const newItems = db.prepare('SELECT * FROM products WHERE tenantId = ? AND isActive = 1 ORDER BY createdAt DESC LIMIT 6').all(tenant.id) as Record<string, unknown>[]
    let msg = `🆕 *Latest Arrivals — ${tenant.businessName}*\n\n`
    newItems.forEach((p, i) => {
      msg += `${i + 1}. *${p.name}*\n`
      if (p.description) msg += `   ${(p.description as string).substring(0, 80)}\n`
      msg += `   💰 ${tenant.currency} ${((p.discountedPrice as number) || (p.price as number)).toFixed(2)}\n\n`
    })
    if (newItems.length === 0) msg += `Check back soon for exciting new products!`
    await send(phone, msg)
    return { handled: true, intent: 'new_products' }
  }

  return { handled: false }
}

// ─── Helper Functions ─────────────────────────────────────────────

async function buildCatalogMessage(tenantId: string): Promise<string> {
  const db = getDb()
  const categories = db.prepare('SELECT * FROM categories WHERE tenantId = ? AND isActive = 1 ORDER BY sortOrder ASC').all(tenantId) as Record<string, unknown>[]

  if (categories.length === 0) {
    const products = db.prepare('SELECT * FROM products WHERE tenantId = ? AND isActive = 1 LIMIT 10').all(tenantId) as Record<string, unknown>[]
    if (products.length === 0) return `📦 Our catalog is being updated. Please check back soon!`
    let msg = `🛍️ *Our Products*\n\n`
    products.forEach((p, i) => { msg += `${i + 1}. *${p.name}* — ${p.currency || 'USD'} ${((p.discountedPrice as number) || (p.price as number)).toFixed(2)}\n` })
    return msg
  }

  let msg = `🛍️ *Browse Our Catalog*\n\n`
  categories.forEach((cat, i) => { msg += `${i + 1}. ${cat.emoji} *${cat.name}*\n` })
  msg += `\nReply with a number to browse that category.`
  return msg
}

function replacePlaceholders(text: string, tenant: TenantRecord, customer: Record<string, unknown>): string {
  return text
    .replace(/\{BUSINESS_NAME\}/g, tenant.businessName)
    .replace(/\{CUSTOMER_NAME\}/g, (customer.name as string) || 'valued customer')
    .replace(/\{PHONE\}/g, tenant.phone || '')
    .replace(/\{EMAIL\}/g, tenant.email || '')
    .replace(/\{WEBSITE\}/g, tenant.website || '')
    .replace(/\{ADDRESS\}/g, tenant.address || '')
    .replace(/\{CURRENCY\}/g, tenant.currency || 'USD')
}

function statusEmoji(status: string): string {
  const map: Record<string, string> = { pending: '⏳', confirmed: '✅', processing: '🔄', ready: '📦', completed: '✔️', cancelled: '❌', refunded: '💸' }
  return map[status] || '📋'
}
