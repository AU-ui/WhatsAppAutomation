import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { flowsApi } from '../services/api'
import { Plus, Zap, Trash2, ToggleLeft, ToggleRight, Download, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'

type FlowAction = { id: string; type: string; config: Record<string, unknown>; label?: string }
type Trigger = { keywords: string[]; exactMatch: boolean; caseSensitive: boolean }

function FlowModal({
  flow, onClose,
}: {
  flow?: Record<string, unknown> | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(flow?.name as string || '')
  const [description, setDescription] = useState(flow?.description as string || '')
  const [category, setCategory] = useState(flow?.category as string || 'custom')
  const [keywords, setKeywords] = useState(
    (flow?.triggers as Trigger[])?.[0]?.keywords?.join(', ') || ''
  )
  const [exactMatch, setExactMatch] = useState(
    (flow?.triggers as Trigger[])?.[0]?.exactMatch || false
  )
  const [replyText, setReplyText] = useState(
    ((flow?.actions as FlowAction[])?.[0]?.config?.text as string) || ''
  )

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      flow ? flowsApi.update(flow._id as string, data) : flowsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      toast.success(flow ? 'Flow updated' : 'Flow created')
      onClose()
    },
    onError: () => toast.error('Failed to save flow'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const kws = keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
    if (!kws.length || !replyText.trim()) {
      toast.error('Please fill in keywords and reply message')
      return
    }
    mutation.mutate({
      name, description, category,
      triggers: [{ keywords: kws, exactMatch, caseSensitive: false }],
      actions: [{ id: 'a1', type: 'send_text', config: { text: replyText } }],
      isActive: true,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-lg my-4">
        <h3 className="text-base font-semibold text-white mb-5">
          {flow ? 'Edit Flow' : 'Create Auto Flow'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Flow Name *</label>
              <input className="input" placeholder="e.g. Menu Request Handler" required
                value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
                {['product', 'booking', 'support', 'marketing', 'onboarding', 'custom'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Match Type</label>
              <select className="input" value={exactMatch ? 'exact' : 'partial'}
                onChange={e => setExactMatch(e.target.value === 'exact')}>
                <option value="partial">Partial match</option>
                <option value="exact">Exact match</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Trigger Keywords *</label>
            <input className="input" placeholder="menu, food, eat, what do you serve (comma-separated)"
              value={keywords} onChange={e => setKeywords(e.target.value)} />
            <p className="text-[10px] text-gray-600 mt-1">
              Separate multiple keywords with commas. Customer message containing ANY of these will trigger the flow.
            </p>
          </div>

          <div>
            <label className="label">Auto-Reply Message *</label>
            <textarea className="input min-h-[120px] resize-none" required
              placeholder="The message to send when this flow is triggered...&#10;&#10;Use *bold*, _italic_ for WhatsApp formatting."
              value={replyText} onChange={e => setReplyText(e.target.value)} />
            <p className="text-[10px] text-gray-600 mt-1">{replyText.length} characters</p>
          </div>

          <div>
            <label className="label">Description (optional)</label>
            <input className="input" placeholder="What does this flow do?"
              value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
              {mutation.isPending ? 'Saving...' : flow ? 'Update Flow' : 'Create Flow'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const CATEGORY_COLORS: Record<string, string> = {
  product: 'badge-blue', booking: 'badge-green', support: 'badge-yellow',
  marketing: 'badge-purple', onboarding: 'badge-gray', custom: 'badge-gray',
}

export default function AutoFlows() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editFlow, setEditFlow] = useState<Record<string, unknown> | null>(null)

  const { data: flowsData, isLoading } = useQuery({
    queryKey: ['flows'],
    queryFn: () => flowsApi.list().then(r => r.data.data),
  })

  const { data: defaultFlows } = useQuery({
    queryKey: ['default-flows'],
    queryFn: () => flowsApi.getDefaults().then(r => r.data.data),
  })

  const toggleMutation = useMutation({
    mutationFn: flowsApi.toggle,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: flowsApi.delete,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['flows'] }); toast.success('Flow deleted') },
  })

  const importMutation = useMutation({
    mutationFn: (df: Record<string, unknown>) => flowsApi.create(df),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['flows'] }); toast.success('Flow imported!') },
  })

  const flows: Record<string, unknown>[] = flowsData || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">
            Keyword-triggered auto-replies. Runs before AI fallback.
          </p>
        </div>
        <button onClick={() => { setEditFlow(null); setShowModal(true) }} className="btn-primary">
          <Plus size={16} /> New Flow
        </button>
      </div>

      {/* Active flows */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-20 animate-pulse" />
          ))}
        </div>
      ) : flows.length === 0 ? (
        <div className="card text-center py-10">
          <Zap size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No flows yet</p>
          <p className="text-gray-600 text-xs mt-1">Import a template or create your own below</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flows.map((flow) => {
            const triggers = flow.triggers as Trigger[]
            const kws = triggers?.[0]?.keywords?.slice(0, 4) || []
            return (
              <div key={flow._id as string} className="card hover:border-gray-700 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white">{flow.name as string}</p>
                      <span className={`${CATEGORY_COLORS[flow.category as string] || 'badge-gray'} text-[9px]`}>
                        {flow.category as string}
                      </span>
                      {!flow.isActive && <span className="badge-red text-[9px]">paused</span>}
                    </div>
                    {flow.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{flow.description as string}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {kws.map((kw: string) => (
                        <span key={kw} className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-md font-mono">
                          {kw}
                        </span>
                      ))}
                      {(triggers?.[0]?.keywords?.length || 0) > 4 && (
                        <span className="text-[10px] text-gray-600">
                          +{(triggers?.[0]?.keywords?.length || 0) - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => { setEditFlow(flow); setShowModal(true) }}
                      className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate(flow._id as string)}
                      className={`p-1.5 rounded transition-colors ${
                        flow.isActive
                          ? 'text-green-400 hover:bg-green-500/10'
                          : 'text-gray-600 hover:bg-gray-800'
                      }`}
                    >
                      {flow.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(flow._id as string)}
                      className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {(flow.triggerCount as number) > 0 && (
                  <p className="text-[10px] text-gray-600 mt-2">
                    Triggered {(flow.triggerCount as number).toLocaleString()} times
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Default flows library */}
      {defaultFlows && defaultFlows.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Flow Templates Library</h3>
          <p className="text-xs text-gray-500 mb-4">Import ready-made flows for your business type</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {defaultFlows.map((df: Record<string, unknown>) => (
              <div key={df.name as string}
                className="flex items-start justify-between gap-2 p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white">{df.name as string}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{df.description as string}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {((df.triggers as Trigger[])?.[0]?.keywords || []).slice(0, 3).map((kw: string) => (
                      <span key={kw} className="text-[9px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded font-mono">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => importMutation.mutate(df)}
                  disabled={importMutation.isPending}
                  className="shrink-0 p-1.5 text-green-400 hover:bg-green-500/10 rounded transition-colors"
                  title="Import this flow"
                >
                  <Download size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <FlowModal
          flow={editFlow}
          onClose={() => { setShowModal(false); setEditFlow(null) }}
        />
      )}
    </div>
  )
}
