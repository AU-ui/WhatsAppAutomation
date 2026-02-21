import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ordersApi } from '../services/api'
import { ShoppingBag, ChevronLeft, ChevronRight, Bell } from 'lucide-react'
import toast from 'react-hot-toast'

const STATUS_STYLE: Record<string, string> = {
  pending: 'badge-yellow', confirmed: 'badge-blue', processing: 'badge-blue',
  ready: 'badge-green', completed: 'badge-green', cancelled: 'badge-red', refunded: 'badge-red',
}

const STATUS_FLOW = ['pending', 'confirmed', 'processing', 'ready', 'completed']

function OrderDetail({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => ordersApi.get(orderId).then(r => r.data.data),
  })

  const statusMutation = useMutation({
    mutationFn: (status: string) => ordersApi.updateStatus(orderId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['order', orderId] })
      toast.success('Order status updated')
    },
  })

  const reminderMutation = useMutation({
    mutationFn: () => ordersApi.sendReminder(orderId),
    onSuccess: () => toast.success('Reminder sent!'),
  })

  if (isLoading) return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const order = data
  if (!order) return null

  const customer = order.customerId as { name?: string; phone: string; email?: string }
  const currentStatusIdx = STATUS_FLOW.indexOf(order.status)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-gray-500">Order</p>
              <p className="text-base font-bold text-white">{order.orderNumber}</p>
            </div>
            <span className={`${STATUS_STYLE[order.status]} text-xs`}>{order.status}</span>
          </div>

          {/* Status pipeline */}
          <div className="flex items-center gap-1 mb-5">
            {STATUS_FLOW.map((s, i) => (
              <div key={s} className="flex-1 flex flex-col items-center gap-1">
                <div className={`w-full h-1.5 rounded-full ${i <= currentStatusIdx ? 'bg-green-500' : 'bg-gray-700'}`} />
                <p className={`text-[9px] ${i <= currentStatusIdx ? 'text-green-400' : 'text-gray-600'}`}>
                  {s}
                </p>
              </div>
            ))}
          </div>

          {/* Customer */}
          <div className="bg-gray-800/50 rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-500 mb-1">Customer</p>
            <p className="text-sm font-medium text-white">{customer?.name || '—'}</p>
            <p className="text-xs text-gray-500 font-mono">{customer?.phone}</p>
          </div>

          {/* Items */}
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">Items</p>
            <div className="space-y-1.5">
              {order.items?.map((item: { productName: string; quantity: number; price: number; subtotal: number }, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300">{item.productName} × {item.quantity}</span>
                  <span className="text-white font-medium">${item.subtotal.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-700">
                <span className="text-white">Total</span>
                <span className="text-green-400">{order.currency} {order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {order.notes && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5 mb-4">
              <p className="text-xs text-yellow-400">📝 {order.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            {order.status !== 'completed' && order.status !== 'cancelled' && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Update Status</p>
                <div className="flex flex-wrap gap-2">
                  {STATUS_FLOW.filter((s, i) => i > currentStatusIdx).map(s => (
                    <button
                      key={s}
                      onClick={() => statusMutation.mutate(s)}
                      disabled={statusMutation.isPending}
                      className="text-xs px-3 py-1.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded hover:bg-green-500/20"
                    >
                      Mark as {s}
                    </button>
                  ))}
                  <button
                    onClick={() => statusMutation.mutate('cancelled')}
                    className="text-xs px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded hover:bg-red-500/20"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {(order.scheduledAt) && (
              <button
                onClick={() => reminderMutation.mutate()}
                disabled={reminderMutation.isPending}
                className="btn-secondary w-full text-xs"
              >
                <Bell size={13} /> Send Appointment Reminder
              </button>
            )}
          </div>

          <button onClick={onClose} className="btn-secondary w-full mt-4">Close</button>
        </div>
      </div>
    </div>
  )
}

export default function Orders() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['orders', page, statusFilter],
    queryFn: () => ordersApi.list({ page, limit: 20, status: statusFilter || undefined }).then(r => r.data),
    placeholderData: (prev) => prev,
  })

  const orders = data?.data || []
  const pagination = data?.pagination

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex gap-3">
        <select className="input w-48" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">All Statuses</option>
          {['pending','confirmed','processing','ready','completed','cancelled'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Order #', 'Customer', 'Status', 'Items', 'Total', 'Date', ''].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 font-medium px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-800">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3 bg-gray-800 rounded animate-pulse w-16" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <ShoppingBag size={28} className="text-gray-700 mx-auto mb-2" />
                    <p className="text-xs text-gray-600">No orders found</p>
                  </td>
                </tr>
              ) : orders.map((o: {
                _id: string; orderNumber: string; status: string; total: number; currency: string;
                items: unknown[]; createdAt: string;
                customerId?: { name?: string; phone: string }
              }) => (
                <tr key={o._id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors cursor-pointer"
                  onClick={() => setSelectedOrderId(o._id)}>
                  <td className="px-4 py-3 font-mono text-xs text-green-400">{o.orderNumber}</td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-white">{o.customerId?.name || '—'}</p>
                    <p className="text-[10px] text-gray-500 font-mono">{o.customerId?.phone}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`${STATUS_STYLE[o.status]} text-[9px]`}>{o.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{o.items?.length || 0}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-white">{o.currency} {o.total.toFixed(2)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-xs text-green-400 hover:underline">View</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && pagination.total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <p className="text-xs text-gray-500">Total: {pagination.total} orders</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white disabled:opacity-30">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= pagination.total}
                className="p-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white disabled:opacity-30">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedOrderId && <OrderDetail orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />}
    </div>
  )
}
