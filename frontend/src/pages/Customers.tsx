import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Filter, Ban, CheckCircle, Send, Tag, ChevronLeft, ChevronRight, User, UserPlus } from 'lucide-react'
import { customersApi } from '../services/api'
import api from '../services/api'
import toast from 'react-hot-toast'

const TAG_COLORS: Record<string, string> = {
  new: 'badge-blue', vip: 'badge-yellow', repeat_buyer: 'badge-green',
  lead: 'badge-gray', hot_lead: 'badge-yellow', cold_lead: 'badge-gray',
  churned: 'badge-red', hotel_guest: 'badge-blue', restaurant_diner: 'badge-blue',
  grocery_buyer: 'badge-green', property_lead: 'badge-purple',
}

function AddCustomerModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    const cleaned = phone.replace(/[\s\-\(\)]/g, '')
    if (!cleaned) { toast.error('Enter a phone number'); return }
    setSaving(true)
    try {
      await api.post('/customers/import', { phone: cleaned, name: name.trim() || undefined })
      toast.success('Customer added! They will receive broadcasts automatically.')
      onAdded()
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Failed to add customer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-sm">
        <h3 className="text-base font-semibold text-white mb-1">Add Customer</h3>
        <p className="text-xs text-gray-500 mb-4">
          Add a number manually to receive all future WhatsApp broadcasts automatically.
        </p>
        <div className="space-y-3">
          <div>
            <label className="label">Phone Number *</label>
            <input
              className="input font-mono"
              placeholder="e.g. 919876543210 (with country code, no +)"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              autoFocus
            />
            <p className="text-[10px] text-gray-600 mt-1">Include country code, no + sign. Example: 919876543210</p>
          </div>
          <div>
            <label className="label">Name (optional)</label>
            <input
              className="input"
              placeholder="Customer name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleAdd} disabled={saving || !phone.trim()} className="btn-primary flex-1">
            {saving ? 'Adding...' : 'Add Customer'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageModal({ customer, onClose }: { customer: { _id: string; name?: string; phone: string }; onClose: () => void }) {
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!msg.trim()) return
    setSending(true)
    try {
      await customersApi.sendMessage(customer._id, msg)
      toast.success('Message sent!')
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string; error?: string } } }
      const detail = e?.response?.data?.error || e?.response?.data?.message || 'Unknown error'
      // Token expired → give actionable hint
      if (detail.includes('OAuthException') || detail.includes('190') || detail.includes('Session has expired') || detail.includes('token')) {
        toast.error('Access token expired — go to Meta Developer → WhatsApp → API Setup → get new token → update in Settings → WhatsApp API', { duration: 6000 })
      } else if (!e?.response) {
        toast.error('Backend not reachable — is the server running? (npm run dev in /backend)')
      } else {
        toast.error(`Send failed: ${detail}`, { duration: 5000 })
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md">
        <h3 className="text-base font-semibold text-white mb-4">
          Send Message to {customer.name || customer.phone}
        </h3>
        <textarea
          className="input min-h-[120px] resize-none mb-4"
          placeholder="Type your message..."
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSend} disabled={sending || !msg.trim()} className="btn-primary flex-1">
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Customers() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [msgTarget, setMsgTarget] = useState<{ _id: string; name?: string; phone: string } | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search, tagFilter],
    queryFn: () => customersApi.list({ page, limit: 20, search: search || undefined, tag: tagFilter || undefined }).then(r => r.data),
    placeholderData: (prev) => prev,
  })

  const { data: stats } = useQuery({
    queryKey: ['customer-stats'],
    queryFn: () => customersApi.getStats().then(r => r.data.data),
  })

  const blockMutation = useMutation({
    mutationFn: ({ id, blocked }: { id: string; blocked: boolean }) =>
      blocked ? customersApi.unblock(id) : customersApi.block(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Customer updated')
    },
  })

  const customers = data?.data || []
  const pagination = data?.pagination

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats?.total || 0, color: 'text-white' },
          { label: 'New Today', value: stats?.newToday || 0, color: 'text-green-400' },
          { label: 'Active', value: stats?.active || 0, color: 'text-blue-400' },
          { label: 'Opted Out', value: stats?.optedOut || 0, color: 'text-red-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card py-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-xl font-bold ${color} mt-0.5`}>{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Add customer button */}
      <div className="flex justify-end">
        <button onClick={() => setShowAddModal(true)} className="btn-primary">
          <UserPlus size={15} /> Add Customer
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input pl-9"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <div className="relative">
          <Filter size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <select
            className="input pl-9 pr-8 appearance-none"
            value={tagFilter}
            onChange={(e) => { setTagFilter(e.target.value); setPage(1) }}
          >
            <option value="">All Tags</option>
            {['new','vip','repeat_buyer','lead','hot_lead','cold_lead','churned'].map(t => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Customer</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Phone</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 hidden md:table-cell">Tags</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 hidden lg:table-cell">Orders</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 hidden lg:table-cell">Spent</th>
                <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Opt-in</th>
                <th className="text-right text-xs text-gray-500 font-medium px-4 py-3">Actions</th>
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
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-600 text-xs">
                    No customers found
                  </td>
                </tr>
              ) : customers.map((c: {
                _id: string; name?: string; phone: string; tags: string[];
                totalOrders: number; totalSpent: number; optIn: boolean; isBlocked: boolean;
                firstSeenAt: string
              }) => (
                <tr key={c._id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 bg-gray-800 rounded-full flex items-center justify-center shrink-0">
                        <User size={12} className="text-gray-500" />
                      </div>
                      <div>
                        <p className="font-medium text-white text-xs">{c.name || '—'}</p>
                        <p className="text-[10px] text-gray-600">{new Date(c.firstSeenAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">{c.phone}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.slice(0, 2).map(tag => (
                        <span key={tag} className={`${TAG_COLORS[tag] || 'badge-gray'} text-[9px]`}>
                          {tag.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-gray-300">{c.totalOrders}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-green-400 font-medium">
                    ${c.totalSpent.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={c.optIn && !c.isBlocked ? 'badge-green text-[9px]' : 'badge-red text-[9px]'}>
                      {c.isBlocked ? 'blocked' : c.optIn ? 'in' : 'out'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setMsgTarget({ _id: c._id, name: c.name, phone: c.phone })}
                        className="p-1.5 rounded text-gray-500 hover:text-green-400 hover:bg-green-500/10 transition-colors"
                        title="Send message"
                        disabled={c.isBlocked || !c.optIn}
                      >
                        <Send size={13} />
                      </button>
                      <button
                        onClick={() => blockMutation.mutate({ id: c._id, blocked: c.isBlocked })}
                        className={`p-1.5 rounded transition-colors ${c.isBlocked
                          ? 'text-green-400 hover:bg-green-500/10'
                          : 'text-gray-500 hover:text-red-400 hover:bg-red-500/10'}`}
                        title={c.isBlocked ? 'Unblock' : 'Block'}
                      >
                        {c.isBlocked ? <CheckCircle size={13} /> : <Ban size={13} />}
                      </button>
                      <button className="p-1.5 rounded text-gray-500 hover:text-blue-400 hover:bg-blue-500/10">
                        <Tag size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <p className="text-xs text-gray-500">
              {((page - 1) * 20) + 1}–{Math.min(page * 20, pagination.total)} of {pagination.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-30"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page === pagination.pages}
                className="p-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {msgTarget && <MessageModal customer={msgTarget} onClose={() => setMsgTarget(null)} />}
      {showAddModal && (
        <AddCustomerModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => queryClient.invalidateQueries({ queryKey: ['customers'] })}
        />
      )}
    </div>
  )
}
