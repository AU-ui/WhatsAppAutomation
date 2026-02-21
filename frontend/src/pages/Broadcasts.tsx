import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Send, Calendar, XCircle, BarChart2, Megaphone, Clock, CheckCircle } from 'lucide-react'
import { broadcastsApi } from '../services/api'
import toast from 'react-hot-toast'

const STATUS_STYLE: Record<string, string> = {
  draft: 'badge-gray', scheduled: 'badge-yellow', running: 'badge-blue',
  completed: 'badge-green', cancelled: 'badge-red', failed: 'badge-red',
}

function CreateBroadcastModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    name: '', type: 'custom', messageType: 'text', textContent: '',
    audienceType: 'all', tags: [] as string[], optInOnly: true,
    scheduledAt: '', sendNow: false,
  })
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null)

  const estimateMutation = useMutation({
    mutationFn: () => broadcastsApi.estimateAudience({
      type: form.audienceType, tags: form.tags, optInOnly: form.optInOnly,
    }),
    onSuccess: (data) => setEstimatedCount(data.data.estimatedCount),
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await broadcastsApi.create({
        name: form.name, type: form.type,
        messageType: form.messageType, textContent: form.textContent,
        audience: { type: form.audienceType, tags: form.tags, optInOnly: form.optInOnly },
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt) : undefined,
      })
      const id = res.data.data._id
      if (form.sendNow) {
        await broadcastsApi.sendNow(id)
      } else if (form.scheduledAt) {
        await broadcastsApi.schedule(id, form.scheduledAt)
      }
      return res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] })
      toast.success('Broadcast created!')
      onClose()
    },
    onError: () => toast.error('Failed to create broadcast'),
  })

  const TAGS = ['new', 'vip', 'repeat_buyer', 'lead', 'hot_lead']
  const TYPES = ['custom', 'marketing', 'festival', 'flash_sale', 'new_product', 'reminder', 'announcement']

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg my-4">
        {/* Step indicator */}
        <div className="flex border-b border-gray-800">
          {['Message', 'Audience', 'Schedule'].map((s, i) => (
            <button
              key={s}
              onClick={() => i + 1 < step && setStep(i + 1)}
              className={`flex-1 py-3 text-xs font-medium transition-colors ${
                step === i + 1 ? 'text-green-400 border-b-2 border-green-500' : 'text-gray-500'
              }`}
            >
              {i + 1}. {s}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Step 1: Message */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="label">Broadcast Name *</label>
                <input className="input" placeholder="e.g. Diwali Sale 2025"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Broadcast Type</label>
                <select className="input" value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Message</label>
                <textarea
                  className="input min-h-[140px] resize-none font-mono text-xs"
                  placeholder="Type your WhatsApp message here...&#10;&#10;Use {{name}} to personalize with customer name.&#10;Use {{business}} for your business name."
                  value={form.textContent}
                  onChange={e => setForm(f => ({ ...f, textContent: e.target.value }))}
                />
                <p className="text-[10px] text-gray-600 mt-1">{form.textContent.length} chars</p>
              </div>
            </div>
          )}

          {/* Step 2: Audience */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="label">Target Audience</label>
                <select className="input" value={form.audienceType}
                  onChange={e => setForm(f => ({ ...f, audienceType: e.target.value }))}>
                  <option value="all">All Customers</option>
                  <option value="tags">By Tags</option>
                  <option value="segment">By Segment</option>
                </select>
              </div>
              {form.audienceType === 'tags' && (
                <div>
                  <label className="label">Select Tags</label>
                  <div className="flex flex-wrap gap-2">
                    {TAGS.map(tag => (
                      <button
                        key={tag}
                        onClick={() => setForm(f => ({
                          ...f,
                          tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
                        }))}
                        className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                          form.tags.includes(tag)
                            ? 'bg-green-500/20 text-green-400 border-green-500/40'
                            : 'border-gray-700 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        {tag.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.optInOnly}
                  onChange={e => setForm(f => ({ ...f, optInOnly: e.target.checked }))}
                  className="accent-green-500" />
                <span className="text-xs text-gray-300">Send only to opted-in customers (recommended)</span>
              </label>
              <button
                onClick={() => estimateMutation.mutate()}
                className="btn-secondary text-xs"
                disabled={estimateMutation.isPending}
              >
                {estimateMutation.isPending ? 'Calculating...' : 'Estimate Audience Size'}
              </button>
              {estimatedCount !== null && (
                <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                  <CheckCircle size={14} />
                  <span>Estimated recipients: <strong>{estimatedCount.toLocaleString()}</strong></span>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Schedule */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setForm(f => ({ ...f, sendNow: true, scheduledAt: '' }))}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                    form.sendNow
                      ? 'border-green-500/50 bg-green-500/10 text-green-400'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <Send size={20} />
                  <span className="text-xs font-medium">Send Now</span>
                </button>
                <button
                  onClick={() => setForm(f => ({ ...f, sendNow: false }))}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                    !form.sendNow
                      ? 'border-green-500/50 bg-green-500/10 text-green-400'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <Clock size={20} />
                  <span className="text-xs font-medium">Schedule</span>
                </button>
              </div>
              {!form.sendNow && (
                <div>
                  <label className="label">Schedule Date & Time</label>
                  <input type="datetime-local" className="input"
                    value={form.scheduledAt}
                    onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
              )}
              {/* Summary */}
              <div className="bg-gray-800 rounded-lg p-3 space-y-1.5 text-xs text-gray-400">
                <p><span className="text-gray-500">Name:</span> {form.name}</p>
                <p><span className="text-gray-500">Audience:</span> {form.audienceType}
                  {estimatedCount !== null && ` (~${estimatedCount} recipients)`}
                </p>
                <p><span className="text-gray-500">When:</span> {form.sendNow ? 'Immediately' : form.scheduledAt || 'Not set'}</p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-6">
            <button onClick={step === 1 ? onClose : () => setStep(s => s - 1)} className="btn-secondary flex-1">
              {step === 1 ? 'Cancel' : 'Back'}
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={step === 1 && !form.name.trim()}
                className="btn-primary flex-1"
              >
                Next
              </button>
            ) : (
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || (!form.sendNow && !form.scheduledAt)}
                className="btn-primary flex-1"
              >
                {createMutation.isPending ? 'Creating...' : form.sendNow ? 'Send Now' : 'Schedule'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Broadcasts() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['broadcasts', statusFilter],
    queryFn: () => broadcastsApi.list({ status: statusFilter || undefined }).then(r => r.data),
  })

  const { data: templates } = useQuery({
    queryKey: ['broadcast-templates'],
    queryFn: () => broadcastsApi.getTemplates().then(r => r.data.data),
  })

  const cancelMutation = useMutation({
    mutationFn: broadcastsApi.cancel,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['broadcasts'] }); toast.success('Broadcast cancelled') },
  })

  const broadcasts = data?.data || []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select className="input w-full sm:w-48" value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {['draft','scheduled','running','completed','cancelled'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="flex-1" />
        <button onClick={() => setShowCreate(true)} className="btn-primary shrink-0">
          <Plus size={16} /> New Broadcast
        </button>
      </div>

      {/* Pre-built templates preview */}
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-3">Quick Templates</h3>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(templates || []).slice(0, 6).map((t: { id: string; name: string; type: string }) => (
            <div key={t.id}
              className="shrink-0 px-3 py-2 rounded-lg border border-gray-700 hover:border-green-500/40
                         hover:bg-green-500/5 cursor-pointer transition-colors">
              <p className="text-xs font-medium text-white">{t.name}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{t.type}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Broadcasts list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card animate-pulse h-20" />
          ))}
        </div>
      ) : broadcasts.length === 0 ? (
        <div className="card text-center py-12">
          <Megaphone size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No broadcasts yet</p>
          <p className="text-gray-600 text-xs mt-1">Create your first campaign to reach customers</p>
        </div>
      ) : (
        <div className="space-y-3">
          {broadcasts.map((b: {
            _id: string; name: string; type: string; status: string;
            scheduledAt?: string; stats: { totalRecipients: number; sent: number; read: number };
            createdAt: string
          }) => (
            <div key={b._id} className="card hover:border-gray-700 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-white">{b.name}</p>
                    <span className={`${STATUS_STYLE[b.status]} text-[10px]`}>{b.status}</span>
                    <span className="badge-gray text-[10px]">{b.type.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    {b.scheduledAt && (
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {new Date(b.scheduledAt).toLocaleString()}
                      </span>
                    )}
                    <span>{b.stats.totalRecipients} recipients</span>
                    {b.stats.sent > 0 && <span>{b.stats.sent} sent</span>}
                    {b.stats.read > 0 && (
                      <span className="text-green-500">
                        {((b.stats.read / b.stats.sent) * 100).toFixed(0)}% read
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {['draft', 'scheduled'].includes(b.status) && (
                    <button
                      onClick={() => cancelMutation.mutate(b._id)}
                      className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded"
                      title="Cancel"
                    >
                      <XCircle size={15} />
                    </button>
                  )}
                  <button className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded" title="Stats">
                    <BarChart2 size={15} />
                  </button>
                </div>
              </div>

              {/* Progress bar for running/completed broadcasts */}
              {['running', 'completed'].includes(b.status) && b.stats.totalRecipients > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-gray-600 mb-1">
                    <span>Delivery progress</span>
                    <span>{Math.round((b.stats.sent / b.stats.totalRecipients) * 100)}%</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1">
                    <div
                      className="bg-green-500 h-1 rounded-full"
                      style={{ width: `${(b.stats.sent / b.stats.totalRecipients) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateBroadcastModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
