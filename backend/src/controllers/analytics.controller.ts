import { Request, Response } from 'express'
import { getDb, fromJson } from '../database/sqlite'

export async function getDashboardStats(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const tenantId = req.tenantId
  const todayStart = new Date(); todayStart.setHours(0,0,0,0)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const todayIso = todayStart.toISOString()
  const sevenDaysIso = sevenDaysAgo.toISOString()
  const thirtyDaysIso = thirtyDaysAgo.toISOString()

  const totalCustomers = (db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE tenantId = ?').get(tenantId) as { cnt: number }).cnt
  const newCustomersToday = (db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE tenantId = ? AND firstSeenAt >= ?').get(tenantId, todayIso) as { cnt: number }).cnt
  const newCustomersThisWeek = (db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE tenantId = ? AND firstSeenAt >= ?').get(tenantId, sevenDaysIso) as { cnt: number }).cnt
  const totalOrders = (db.prepare('SELECT COUNT(*) as cnt FROM orders WHERE tenantId = ?').get(tenantId) as { cnt: number }).cnt
  const activeConversations = (db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE tenantId = ? AND lastMessageAt >= ?').get(tenantId, sevenDaysIso) as { cnt: number }).cnt
  const broadcastsSent = (db.prepare(`SELECT COUNT(*) as cnt FROM broadcasts WHERE tenantId = ? AND status = 'completed'`).get(tenantId) as { cnt: number }).cnt
  const broadcastsThisMonth = (db.prepare(`SELECT COUNT(*) as cnt FROM broadcasts WHERE tenantId = ? AND status = 'completed' AND completedAt >= ?`).get(tenantId, thirtyDaysIso) as { cnt: number }).cnt

  const todayRevenue = (db.prepare(`SELECT COALESCE(SUM(total), 0) as rev FROM orders WHERE tenantId = ? AND createdAt >= ? AND status != 'cancelled'`).get(tenantId, todayIso) as { rev: number }).rev
  const monthRevenue = (db.prepare(`SELECT COALESCE(SUM(total), 0) as rev FROM orders WHERE tenantId = ? AND createdAt >= ? AND status != 'cancelled'`).get(tenantId, thirtyDaysIso) as { rev: number }).rev
  const todayMessages = (db.prepare('SELECT COUNT(*) as cnt FROM messages WHERE tenantId = ? AND createdAt >= ?').get(tenantId, todayIso) as { cnt: number }).cnt

  // Get today's analytics record
  const todayDate = todayStart.toISOString().slice(0, 10)
  const analyticsRow = db.prepare('SELECT * FROM analytics WHERE tenantId = ? AND date = ?').get(tenantId, todayDate) as Record<string, unknown> | undefined
  const msgStats = fromJson<{ incoming?: number; outgoing?: number; aiGenerated?: number }>(analyticsRow?.messages as string, {})
  const hourlyMessages = fromJson<number[]>(analyticsRow?.hourlyMessages as string, new Array(24).fill(0))

  res.json({
    success: true,
    data: {
      customers: {
        total: totalCustomers,
        newToday: newCustomersToday,
        newThisWeek: newCustomersThisWeek,
        activeConversations,
      },
      revenue: {
        today: todayRevenue,
        thisMonth: monthRevenue,
        totalOrders,
      },
      messages: {
        today: todayMessages,
        incoming: msgStats.incoming || 0,
        outgoing: msgStats.outgoing || 0,
        aiGenerated: msgStats.aiGenerated || 0,
      },
      broadcasts: {
        total: broadcastsSent,
        thisMonth: broadcastsThisMonth,
      },
      hourlyActivity: hourlyMessages,
    },
  })
}

export async function getAnalyticsTrend(req: Request, res: Response): Promise<void> {
  const { days = 30 } = req.query
  const db = getDb()
  const startDate = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000)
  const startIso = startDate.toISOString().slice(0, 10)

  const rows = db.prepare('SELECT * FROM analytics WHERE tenantId = ? AND date >= ? ORDER BY date ASC').all(req.tenantId, startIso) as Record<string, unknown>[]

  const analytics = rows.map(r => ({
    ...r,
    _id: r.id,
    messages: fromJson(r.messages as string, {}),
    customers: fromJson(r.customers as string, {}),
    orders: fromJson(r.orders as string, {}),
    revenue: fromJson(r.revenue as string, {}),
    broadcasts: fromJson(r.broadcasts as string, {}),
    hourlyMessages: fromJson(r.hourlyMessages as string, new Array(24).fill(0)),
  }))

  res.json({ success: true, data: analytics })
}

export async function getTopCustomers(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const rows = db.prepare('SELECT id, name, phone, tags, totalOrders, totalSpent, leadScore FROM customers WHERE tenantId = ? ORDER BY totalSpent DESC LIMIT 10').all(req.tenantId) as Record<string, unknown>[]
  const customers = rows.map(r => ({
    ...r,
    _id: r.id,
    tags: fromJson(r.tags as string, []),
  }))
  res.json({ success: true, data: customers })
}

export async function getRevenueByPeriod(req: Request, res: Response): Promise<void> {
  const { period = 'month' } = req.query
  const db = getDb()
  const startDate = period === 'week'
    ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    : period === 'year'
    ? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const groupFormat = period === 'year' ? '%Y-%m' : '%Y-%m-%d'
  const rows = db.prepare(`
    SELECT strftime('${groupFormat}', createdAt) as _id, SUM(total) as revenue, COUNT(*) as orders
    FROM orders
    WHERE tenantId = ? AND createdAt >= ? AND status != 'cancelled'
    GROUP BY _id
    ORDER BY _id ASC
  `).all(req.tenantId, startDate.toISOString()) as Record<string, unknown>[]

  res.json({ success: true, data: rows })
}

export async function getConversionFunnel(req: Request, res: Response): Promise<void> {
  const db = getDb()
  const tenantId = req.tenantId
  const thirtyDaysIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const totalContacted = (db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE tenantId = ?').get(tenantId) as { cnt: number }).cnt
  const withMessages = (db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE tenantId = ? AND totalMessages > 0').get(tenantId) as { cnt: number }).cnt
  const withOrders = (db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE tenantId = ? AND totalOrders > 0').get(tenantId) as { cnt: number }).cnt
  const completedOrders = (db.prepare(`SELECT COUNT(*) as cnt FROM orders WHERE tenantId = ? AND status = 'completed' AND createdAt >= ?`).get(tenantId, thirtyDaysIso) as { cnt: number }).cnt

  res.json({
    success: true,
    data: {
      contacted: totalContacted,
      engaged: withMessages,
      converted: withOrders,
      retained: completedOrders,
      conversionRate: totalContacted > 0 ? ((withOrders / totalContacted) * 100).toFixed(1) : 0,
    },
  })
}
