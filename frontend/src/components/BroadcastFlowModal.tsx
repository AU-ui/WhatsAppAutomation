/**
 * BroadcastFlowModal
 * Shown after saving a product/offer. Animates the broadcast flow and lets
 * the business owner Stop or Send Immediately before the 20-second auto-send.
 */
import { useEffect, useState, useRef } from 'react'
import { CheckCircle2, XCircle, Send, Users, Zap, Package, X } from 'lucide-react'
import { pendingBroadcastApi } from '../services/api'
import toast from 'react-hot-toast'

export interface PendingBroadcast {
  broadcastId: string
  message: string
  recipientCount: number
  scheduledAt: string
}

interface Props {
  broadcast: PendingBroadcast
  productName: string
  isOffer: boolean
  onClose: () => void
}

const COUNTDOWN_SECONDS = 20

type FlowStatus = 'running' | 'sent' | 'stopped'

export default function BroadcastFlowModal({ broadcast, productName, isOffer, onClose }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS)
  const [status, setStatus] = useState<FlowStatus>('running')
  const [step, setStep] = useState(0)          // 0 = saved, 1 = prepared, 2 = countdown, 3 = done
  const [actionLoading, setActionLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasActed = useRef(false)

  // Animate through steps
  useEffect(() => {
    const s1 = setTimeout(() => setStep(1), 400)
    const s2 = setTimeout(() => setStep(2), 900)
    return () => { clearTimeout(s1); clearTimeout(s2) }
  }, [])

  // Countdown
  useEffect(() => {
    if (step < 2 || status !== 'running') return
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearInterval(timerRef.current!)
          if (!hasActed.current) {
            setStep(3)
            setStatus('sent')
          }
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current!)
  }, [step, status])

  const handleStop = async () => {
    if (hasActed.current || status !== 'running') return
    hasActed.current = true
    clearInterval(timerRef.current!)
    setActionLoading(true)
    try {
      await pendingBroadcastApi.cancel(broadcast.broadcastId)
      setStatus('stopped')
      setStep(3)
      toast.success('Broadcast stopped — no messages sent')
    } catch {
      toast.error('Could not cancel — broadcast may have already sent')
      setStatus('sent')
      setStep(3)
    } finally {
      setActionLoading(false)
    }
  }

  const handleSendNow = async () => {
    if (hasActed.current || status !== 'running') return
    hasActed.current = true
    clearInterval(timerRef.current!)
    setActionLoading(true)
    try {
      await pendingBroadcastApi.sendNow(broadcast.broadcastId)
      setStatus('sent')
      setStep(3)
      toast.success(`Sent to ${broadcast.recipientCount} customer${broadcast.recipientCount !== 1 ? 's' : ''}!`, { duration: 4000 })
    } catch {
      toast.error('Send failed — check WhatsApp token in Settings')
      setStatus('stopped')
      setStep(3)
    } finally {
      setActionLoading(false)
    }
  }

  const flowSteps = [
    { icon: Package,      label: 'Product Saved',                  done: step >= 0 },
    { icon: Zap,          label: 'Message Prepared',                done: step >= 1 },
    { icon: Users,        label: `Sending to ${broadcast.recipientCount} customers`, done: step >= 2 },
  ]

  // WhatsApp-style message preview lines
  const previewLines = broadcast.message.split('\n').slice(0, 12)

  const progress = ((COUNTDOWN_SECONDS - secondsLeft) / COUNTDOWN_SECONDS) * 100

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl shadow-black/60 overflow-hidden">

        {/* Header */}
        <div className={`px-5 py-4 flex items-center justify-between border-b border-gray-800
          ${status === 'stopped' ? 'bg-red-500/10' : status === 'sent' ? 'bg-green-500/10' : 'bg-gray-800/40'}`}>
          <div>
            <p className="text-sm font-semibold text-white">
              {status === 'stopped' ? '⛔ Broadcast Stopped' :
               status === 'sent'    ? '✅ Broadcast Sent!'   :
               isOffer ? '🔥 Offer Broadcast' : '📢 New Product Broadcast'}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">{productName}</p>
          </div>
          {(status === 'sent' || status === 'stopped') && (
            <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="p-5 space-y-5">
          {/* ── Flow Steps ── */}
          <div className="flex items-center gap-0">
            {flowSteps.map((s, i) => (
              <div key={i} className="flex items-center flex-1">
                {/* Step bubble */}
                <div className={`flex flex-col items-center gap-1 flex-1`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-500
                    ${s.done
                      ? status === 'stopped' && i === 2 ? 'bg-red-500/20 border border-red-500/40'
                        : 'bg-green-500/20 border border-green-500/40'
                      : 'bg-gray-800 border border-gray-700'
                    }`}>
                    <s.icon size={16} className={s.done
                      ? status === 'stopped' && i === 2 ? 'text-red-400' : 'text-green-400'
                      : 'text-gray-600'} />
                  </div>
                  <span className={`text-[9px] text-center leading-tight px-1
                    ${s.done ? 'text-gray-300' : 'text-gray-600'}`}>
                    {s.label}
                  </span>
                </div>
                {/* Connector line */}
                {i < flowSteps.length - 1 && (
                  <div className={`h-px flex-shrink-0 w-8 transition-all duration-500
                    ${step > i ? 'bg-green-500/50' : 'bg-gray-800'}`} />
                )}
              </div>
            ))}
          </div>

          {/* ── Countdown progress bar (only while running) ── */}
          {status === 'running' && step >= 2 && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>Auto-sending in</span>
                <span className={`font-mono font-bold ${secondsLeft <= 5 ? 'text-red-400' : 'text-green-400'}`}>
                  {secondsLeft}s
                </span>
              </div>
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-1000"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-600 mt-1">
                Message sends automatically unless you stop it below
              </p>
            </div>
          )}

          {/* ── Done states ── */}
          {status === 'sent' && (
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
              <CheckCircle2 size={20} className="text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-400">
                  Sent to {broadcast.recipientCount} customer{broadcast.recipientCount !== 1 ? 's' : ''}!
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  WhatsApp messages are being delivered now
                </p>
              </div>
            </div>
          )}
          {status === 'stopped' && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <XCircle size={20} className="text-red-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-400">Broadcast stopped</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  No messages were sent. You can edit and re-save anytime.
                </p>
              </div>
            </div>
          )}

          {/* ── WhatsApp message preview ── */}
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
              WhatsApp message preview
            </p>
            <div className="bg-[#0b1e12] rounded-xl p-3 border border-green-900/30 max-h-40 overflow-y-auto">
              {/* WA header bar */}
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-green-900/30">
                <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center">
                  <span className="text-[10px] text-white font-bold">W</span>
                </div>
                <span className="text-[10px] text-green-400 font-medium">Your Business</span>
                <span className="text-[9px] text-gray-600 ml-auto">now</span>
              </div>
              {/* Message bubble */}
              <div className="bg-[#1a5c2c] rounded-xl rounded-tl-sm px-3 py-2 max-w-[85%] ml-auto">
                {previewLines.map((line, i) => (
                  <p key={i} className="text-[11px] text-gray-100 leading-relaxed whitespace-pre-wrap">
                    {line || '\u00A0'}
                  </p>
                ))}
                {broadcast.message.split('\n').length > 12 && (
                  <p className="text-[9px] text-green-300/60 mt-1">... (message continues)</p>
                )}
              </div>
              <p className="text-[9px] text-gray-600 text-right mt-1">
                ✓✓ sent · {broadcast.recipientCount} recipients
              </p>
            </div>
          </div>

          {/* ── Action buttons (only while running) ── */}
          {status === 'running' && (
            <div className="flex gap-3">
              <button
                onClick={handleStop}
                disabled={actionLoading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-500/40 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                <XCircle size={15} />
                Stop Broadcast
              </button>
              <button
                onClick={handleSendNow}
                disabled={actionLoading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl wa-gradient text-white text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-green-500/20"
              >
                {actionLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><Send size={14} /> Send Now</>
                )}
              </button>
            </div>
          )}

          {/* Close button after done */}
          {status !== 'running' && (
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl border border-gray-700 text-gray-400 text-sm hover:text-white hover:border-gray-600 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
