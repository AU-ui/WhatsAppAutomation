import { useQuery } from '@tanstack/react-query'
import {
  Users, MessageSquare, ShoppingBag, TrendingUp, Megaphone,
  Zap, ArrowUpRight, ArrowDownRight, AlertCircle,
} from 'lucide-react'
import { analyticsApi } from '../services/api'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { useAuth } from '../context/AuthContext'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

interface StatCardProps {
  title: string
  value: string | number
  sub?: string
  icon: React.ElementType
  trend?: number
  color?: string
}

function StatCard({ title, value, sub, icon: Icon, trend, color = 'green' }: StatCardProps) {
  const colorMap: Record<string, string> = {
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    blue:  'bg-blue-500/10  text-blue-400  border-blue-500/20',
    yellow:'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    purple:'bg-purple-500/10 text-purple-400 border-purple-500/20',
  }
  return (
    <div className="card flex flex-col gap-3 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${colorMap[color]}`}>
          <Icon size={18} />
        </div>
      </div>
      {trend !== undefined && (
        <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {trend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {Math.abs(trend)}% vs last period
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { tenant } = useAuth()

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => analyticsApi.getDashboard().then(r => r.data.data),
    refetchInterval: 60_000,
  })

  const { data: trendData } = useQuery({
    queryKey: ['analytics-trend', 7],
    queryFn: () => analyticsApi.getTrend(7).then(r => r.data.data),
  })

  const { data: topCustomers } = useQuery({
    queryKey: ['top-customers'],
    queryFn: () => analyticsApi.getTopCustomers().then(r => r.data.data),
  })

  const chartData = {
    labels: trendData?.map((d: { date: string }) => new Date(d.date).toLocaleDateString('en', { weekday: 'short' })) || [],
    datasets: [
      {
        label: 'Incoming',
        data: trendData?.map((d: { messages: { incoming: number } }) => d.messages?.incoming || 0) || [],
        borderColor: '#25D366',
        backgroundColor: 'rgba(37,211,102,0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
      },
      {
        label: 'Outgoing',
        data: trendData?.map((d: { messages: { outgoing: number } }) => d.messages?.outgoing || 0) || [],
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59,130,246,0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#9CA3AF', font: { size: 11 } } },
      tooltip: { mode: 'index' as const, intersect: false },
    },
    scales: {
      x: { grid: { color: '#1F2937' }, ticks: { color: '#6B7280', font: { size: 11 } } },
      y: { grid: { color: '#1F2937' }, ticks: { color: '#6B7280', font: { size: 11 } } },
    },
  }

  const hourlyData = {
    labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
    datasets: [{
      label: 'Messages',
      data: statsData?.hourlyActivity || new Array(24).fill(0),
      backgroundColor: 'rgba(37,211,102,0.6)',
      borderRadius: 3,
    }],
  }

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const s = statsData

  return (
    <div className="space-y-6">
      {/* WhatsApp not connected warning */}
      {!tenant?.whatsapp?.isVerified && (
        <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-400 text-sm">
          <AlertCircle size={18} className="shrink-0" />
          <span>
            WhatsApp is not connected.{' '}
            <a href="/settings" className="underline font-medium hover:text-yellow-300">
              Configure Meta credentials →
            </a>
          </span>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Customers"
          value={s?.customers?.total?.toLocaleString() || 0}
          sub={`+${s?.customers?.newToday || 0} today`}
          icon={Users}
          color="green"
          trend={12}
        />
        <StatCard
          title="Messages Today"
          value={s?.messages?.today?.toLocaleString() || 0}
          sub={`${s?.messages?.aiGenerated || 0} AI generated`}
          icon={MessageSquare}
          color="blue"
        />
        <StatCard
          title="Revenue (Month)"
          value={`$${(s?.revenue?.thisMonth || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub={`${s?.revenue?.totalOrders || 0} total orders`}
          icon={TrendingUp}
          color="purple"
          trend={8}
        />
        <StatCard
          title="Active Conversations"
          value={s?.customers?.activeConversations?.toLocaleString() || 0}
          sub={`${s?.broadcasts?.total || 0} broadcasts sent`}
          icon={Zap}
          color="yellow"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Message trend */}
        <div className="card lg:col-span-2">
          <h3 className="text-sm font-semibold text-white mb-4">Message Activity — Last 7 Days</h3>
          <div className="h-48">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Today's hourly heatmap */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Today's Activity by Hour</h3>
          <div className="h-48">
            <Line
              data={hourlyData}
              options={{
                ...chartOptions,
                plugins: { ...chartOptions.plugins, legend: { display: false } },
              }}
            />
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top customers */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Top Customers</h3>
          <div className="space-y-2">
            {(topCustomers || []).slice(0, 6).map((c: {
              _id: string; name?: string; phone: string; totalOrders: number; totalSpent: number; tags: string[]
            }, i: number) => (
              <div key={c._id} className="flex items-center justify-between py-1.5 border-b border-gray-800 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-4">{i + 1}</span>
                  <div className="w-7 h-7 bg-gray-800 rounded-full flex items-center justify-center text-xs text-gray-400 font-medium">
                    {(c.name || c.phone)[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-white">{c.name || c.phone}</p>
                    <p className="text-[10px] text-gray-500">{c.totalOrders} orders</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-green-400">${c.totalSpent.toFixed(2)}</p>
                  {c.tags.includes('vip') && <span className="badge-yellow text-[9px]">VIP</span>}
                </div>
              </div>
            ))}
            {!topCustomers?.length && (
              <p className="text-xs text-gray-600 py-4 text-center">No customer data yet</p>
            )}
          </div>
        </div>

        {/* Quick stats summary */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Platform Summary</h3>
          <div className="space-y-3">
            {[
              { label: 'AI-Generated Replies', value: s?.messages?.aiGenerated || 0, icon: Zap, color: 'text-green-400' },
              { label: 'Broadcasts Completed', value: s?.broadcasts?.total || 0, icon: Megaphone, color: 'text-blue-400' },
              { label: 'New Customers This Week', value: s?.customers?.newThisWeek || 0, icon: Users, color: 'text-purple-400' },
              { label: 'Orders Created Today', value: s?.messages?.outgoing || 0, icon: ShoppingBag, color: 'text-yellow-400' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <Icon size={14} className={color} />
                  <span className="text-xs text-gray-400">{label}</span>
                </div>
                <span className="text-sm font-semibold text-white">{value.toLocaleString()}</span>
              </div>
            ))}
          </div>

          {/* Subscription usage */}
          <div className="mt-4 pt-4 border-t border-gray-800">
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span>Monthly Message Quota</span>
              <span>{s?.messages?.today || 0} used</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full"
                style={{ width: `${Math.min((s?.messages?.today || 0) / 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
