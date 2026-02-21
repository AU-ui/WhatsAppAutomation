import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../services/api'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { TrendingUp, Users, MessageSquare, ShoppingBag } from 'lucide-react'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Title, Tooltip, Legend, Filler
)

const CHART_DEFAULTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#9CA3AF', font: { size: 11 } } } },
  scales: {
    x: { grid: { color: '#1F2937' }, ticks: { color: '#6B7280', font: { size: 10 } } },
    y: { grid: { color: '#1F2937' }, ticks: { color: '#6B7280', font: { size: 10 } } },
  },
}

export default function Analytics() {
  const [period, setPeriod] = useState('month')

  const { data: trend } = useQuery({
    queryKey: ['analytics-trend', 30],
    queryFn: () => analyticsApi.getTrend(30).then(r => r.data.data),
  })

  const { data: revenue } = useQuery({
    queryKey: ['analytics-revenue', period],
    queryFn: () => analyticsApi.getRevenue(period).then(r => r.data.data),
  })

  const { data: funnel } = useQuery({
    queryKey: ['analytics-funnel'],
    queryFn: () => analyticsApi.getFunnel().then(r => r.data.data),
  })

  const { data: topCustomers } = useQuery({
    queryKey: ['top-customers'],
    queryFn: () => analyticsApi.getTopCustomers().then(r => r.data.data),
  })

  const messageChartData = {
    labels: trend?.map((d: { date: string }) =>
      new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })
    ) || [],
    datasets: [
      {
        label: 'Incoming',
        data: trend?.map((d: { messages: { incoming: number } }) => d.messages?.incoming || 0) || [],
        borderColor: '#25D366', backgroundColor: 'rgba(37,211,102,0.1)', fill: true, tension: 0.4,
      },
      {
        label: 'AI Generated',
        data: trend?.map((d: { messages: { aiGenerated: number } }) => d.messages?.aiGenerated || 0) || [],
        borderColor: '#8B5CF6', backgroundColor: 'rgba(139,92,246,0.1)', fill: true, tension: 0.4,
      },
    ],
  }

  const revenueChartData = {
    labels: revenue?.map((d: { _id: string }) => d._id) || [],
    datasets: [{
      label: 'Revenue',
      data: revenue?.map((d: { revenue: number }) => d.revenue) || [],
      backgroundColor: 'rgba(37,211,102,0.7)',
      borderRadius: 4,
    }],
  }

  const funnelData = {
    labels: ['Contacted', 'Engaged', 'Converted', 'Retained'],
    datasets: [{
      data: funnel ? [funnel.contacted, funnel.engaged, funnel.converted, funnel.retained] : [0, 0, 0, 0],
      backgroundColor: ['rgba(37,211,102,0.8)', 'rgba(59,130,246,0.8)', 'rgba(139,92,246,0.8)', 'rgba(245,158,11,0.8)'],
      borderWidth: 0,
    }],
  }

  const conversionRate = funnel?.conversionRate || 0

  return (
    <div className="space-y-6">
      {/* Funnel KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Contacted', value: funnel?.contacted || 0, icon: Users, color: 'text-green-400' },
          { label: 'Engaged', value: funnel?.engaged || 0, icon: MessageSquare, color: 'text-blue-400' },
          { label: 'Converted', value: funnel?.converted || 0, icon: ShoppingBag, color: 'text-purple-400' },
          { label: 'Conversion Rate', value: `${conversionRate}%`, icon: TrendingUp, color: 'text-yellow-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500">{label}</p>
              <Icon size={16} className={color} />
            </div>
            <p className={`text-2xl font-bold ${color}`}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2">
          <h3 className="text-sm font-semibold text-white mb-4">Message Volume — Last 30 Days</h3>
          <div className="h-52">
            <Line data={messageChartData} options={CHART_DEFAULTS} />
          </div>
        </div>
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Conversion Funnel</h3>
          <div className="h-52">
            <Doughnut
              data={funnelData}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'bottom', labels: { color: '#9CA3AF', font: { size: 10 }, boxWidth: 10 } },
                },
              }}
            />
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Revenue</h3>
            <div className="flex gap-1">
              {['week', 'month', 'year'].map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    period === p
                      ? 'bg-green-500/20 text-green-400'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="h-48">
            <Bar data={revenueChartData} options={CHART_DEFAULTS} />
          </div>
        </div>

        {/* Top customers table */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Top Customers by Revenue</h3>
          <div className="space-y-2">
            {(topCustomers || []).slice(0, 7).map((c: {
              _id: string; name?: string; phone: string; totalOrders: number;
              totalSpent: number; tags: string[]
            }, i: number) => (
              <div key={c._id} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-4 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium text-white truncate">{c.name || c.phone}</p>
                    {c.tags.includes('vip') && <span className="badge-yellow text-[9px]">VIP</span>}
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1 mt-1">
                    <div
                      className="bg-green-500/60 h-1 rounded-full"
                      style={{
                        width: `${Math.min(
                          (c.totalSpent / Math.max(...(topCustomers || []).map((x: { totalSpent: number }) => x.totalSpent), 1)) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs font-semibold text-green-400 shrink-0">${c.totalSpent.toFixed(0)}</p>
              </div>
            ))}
            {!topCustomers?.length && (
              <p className="text-xs text-gray-600 py-4 text-center">No revenue data yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


