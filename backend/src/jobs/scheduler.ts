/**
 * Job Scheduler — Node-cron based task runner
 */
import cron from 'node-cron'
import { logger } from '../utils/logger'
import { runScheduledBroadcasts, runAutoTriggers, sendAppointmentReminder, sendFeedbackRequest } from '../services/broadcast.service'
import { getDb, fromJson, nowIso, toJson } from '../database/sqlite'

export function startScheduler(): void {
  logger.info('Starting job scheduler...')

  // ── Every 1 minute: Process scheduled broadcasts ──
  cron.schedule('* * * * *', async () => {
    try {
      await runScheduledBroadcasts()
    } catch (err) {
      logger.error({ err }, 'Scheduled broadcast job failed')
    }
  })

  // ── Every hour: Auto triggers ──
  cron.schedule('0 * * * *', async () => {
    try {
      const db = getDb()
      const tenants = db.prepare(`SELECT id FROM tenants WHERE isActive = 1`).all() as { id: string }[]
      for (const tenant of tenants) {
        const row = db.prepare('SELECT subscription FROM tenants WHERE id = ?').get(tenant.id) as { subscription: string }
        const sub = fromJson<{ status?: string }>(row.subscription, {})
        if (sub.status === 'active') {
          await runAutoTriggers(tenant.id).catch((err) =>
            logger.error({ err, tenantId: tenant.id }, 'Auto trigger failed for tenant')
          )
        }
      }
    } catch (err) {
      logger.error({ err }, 'Auto trigger job failed')
    }
  })

  // ── Every day at 9:00 AM: Send appointment reminders (24h advance) ──
  cron.schedule('0 9 * * *', async () => {
    try {
      const db = getDb()
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(0, 0, 0, 0)
      const dayAfterTomorrow = new Date(tomorrow)
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1)

      const upcomingOrders = db.prepare(`
        SELECT id, tenantId FROM orders
        WHERE type IN ('appointment', 'table_booking', 'room_reservation', 'site_visit', 'service_booking')
        AND status IN ('pending', 'confirmed')
        AND scheduledAt >= ? AND scheduledAt < ?
        AND reminderSentAt IS NULL
      `).all(tomorrow.toISOString(), dayAfterTomorrow.toISOString()) as { id: string; tenantId: string }[]

      for (const order of upcomingOrders) {
        await sendAppointmentReminder(order.tenantId, order.id).catch((err) =>
          logger.error({ err, orderId: order.id }, 'Appointment reminder failed')
        )
        db.prepare('UPDATE orders SET reminderSentAt = ? WHERE id = ?').run(nowIso(), order.id)
      }

      logger.info({ count: upcomingOrders.length }, 'Appointment reminders sent')
    } catch (err) {
      logger.error({ err }, 'Appointment reminder job failed')
    }
  })

  // ── Every day at 11 AM: Send feedback requests ──
  cron.schedule('0 11 * * *', async () => {
    try {
      const db = getDb()
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      yesterday.setHours(0, 0, 0, 0)
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const completedOrders = db.prepare(`
        SELECT id, tenantId, customerId FROM orders
        WHERE status = 'completed'
        AND updatedAt >= ? AND updatedAt < ?
        AND feedbackSentAt IS NULL
      `).all(yesterday.toISOString(), today.toISOString()) as { id: string; tenantId: string; customerId: string }[]

      for (const order of completedOrders) {
        await sendFeedbackRequest(order.tenantId, order.customerId, order.id).catch((err) =>
          logger.error({ err, orderId: order.id }, 'Feedback request failed')
        )
        db.prepare('UPDATE orders SET feedbackSentAt = ? WHERE id = ?').run(nowIso(), order.id)
      }

      logger.info({ count: completedOrders.length }, 'Feedback requests sent')
    } catch (err) {
      logger.error({ err }, 'Feedback request job failed')
    }
  })

  // ── First day of month at midnight: Reset usage counters ──
  cron.schedule('0 0 1 * *', async () => {
    try {
      const db = getDb()
      const tenants = db.prepare('SELECT id, subscription FROM tenants').all() as { id: string; subscription: string }[]
      const nextMonth = new Date()
      nextMonth.setMonth(nextMonth.getMonth() + 1, 1)
      nextMonth.setHours(0, 0, 0, 0)

      for (const tenant of tenants) {
        const sub = fromJson<Record<string, unknown>>(tenant.subscription, {})
        sub.messagesUsedThisMonth = 0
        sub.messagesResetAt = nextMonth.toISOString()
        db.prepare('UPDATE tenants SET subscription = ? WHERE id = ?').run(toJson(sub), tenant.id)
      }

      logger.info('Monthly message counters reset')
    } catch (err) {
      logger.error({ err }, 'Monthly reset job failed')
    }
  })

  // ── Daily at 1 AM: Check expired trials ──
  cron.schedule('0 1 * * *', async () => {
    try {
      const db = getDb()
      const now = new Date().toISOString()
      const tenants = db.prepare('SELECT id, subscription FROM tenants').all() as { id: string; subscription: string }[]

      for (const tenant of tenants) {
        const sub = fromJson<{ status?: string; trialEndsAt?: string }>(tenant.subscription, {})
        if (sub.status === 'trialing' && sub.trialEndsAt && sub.trialEndsAt < now) {
          sub.status = 'canceled'
          db.prepare('UPDATE tenants SET subscription = ? WHERE id = ?').run(toJson(sub), tenant.id)
        }
      }

      logger.info('Expired trial subscriptions updated')
    } catch (err) {
      logger.error({ err }, 'Subscription check job failed')
    }
  })

  // ── Daily at 8 AM: Festival campaigns ──
  cron.schedule('0 8 * * *', async () => {
    try {
      await checkFestivalCampaigns()
    } catch (err) {
      logger.error({ err }, 'Festival campaign check failed')
    }
  })

  logger.info('Job scheduler started — all jobs registered')
}

async function checkFestivalCampaigns(): Promise<void> {
  const today = new Date()
  const month = today.getMonth() + 1
  const day = today.getDate()

  const festivals: Record<string, string> = {
    '01-01': 'New Year',
    '02-14': "Valentine's Day",
    '10-31': 'Halloween',
    '12-24': 'Christmas Eve',
    '12-25': 'Christmas',
    '12-31': "New Year's Eve",
  }

  const dateKey = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const festival = festivals[dateKey]
  if (!festival) return

  logger.info({ festival, date: dateKey }, 'Festival campaign triggered')

  const db = getDb()
  const tenants = db.prepare('SELECT id, businessName, subscription FROM tenants WHERE isActive = 1').all() as { id: string; businessName: string; subscription: string }[]

  for (const tenant of tenants) {
    const sub = fromJson<{ plan?: string; status?: string }>(tenant.subscription, {})
    if (!['pro', 'enterprise'].includes(sub.plan || '') || sub.status !== 'active') continue

    const { generateId, nowIso: now, toJson: tj } = await import('../database/sqlite')
    const id = generateId()
    const nowStr = now()

    db.prepare(`
      INSERT INTO broadcasts (id, tenantId, name, type, status, messageType, textContent, audience, recipients, stats, sendRate, scheduledAt, isAutoTriggered, triggerEvent, createdAt, updatedAt)
      VALUES (?, ?, ?, 'festival', 'scheduled', 'text', ?, ?, '[]', ?, 1, ?, 1, ?, ?, ?)
    `).run(
      id, tenant.id,
      `${festival} Greeting — Auto`,
      `🎉 *Happy ${festival}!* 🎉\n\nFrom everyone at *${tenant.businessName}*! 🎁\n\nType *OFFERS* to see special deals!\n\n_Reply STOP to unsubscribe_`,
      tj({ type: 'all', optInOnly: true }),
      tj({ totalRecipients: 0, sent: 0, failed: 0, delivered: 0, read: 0 }),
      nowStr, `festival_${festival.toLowerCase().replace(/\s+/g, '_')}`,
      nowStr, nowStr
    )
  }
}
