import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Send, Phone, User, CheckCheck, Clock, ArrowLeft, Wifi, WifiOff } from 'lucide-react'
import { inboxApi } from '../services/api'
import toast from 'react-hot-toast'

type Conversation = {
  _id: string
  name?: string
  phone: string
  optIn: boolean
  isBlocked: boolean
  lastMessageAt: string
  lastMessage?: {
    content: string | null
    role: string
    type: string
    createdAt: string
  }
  incomingTotal: number
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  type: string
  content: string | null
  mediaUrl?: string
  status: string
  aiGenerated?: boolean
  isFromBroadcast?: boolean
  createdAt: string
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const now = Date.now()
  const d = new Date(dateStr).getTime()
  const diff = now - d
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatTime(dateStr: string): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

export default function Inbox() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [reply, setReply] = useState('')
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()

  // Conversations list — poll every 10s
  const { data: convData, isLoading: convLoading } = useQuery({
    queryKey: ['inbox-conversations', search],
    queryFn: () => inboxApi.getConversations(search || undefined).then(r => r.data.data as Conversation[]),
    refetchInterval: 10000,
  })

  // Selected conversation messages — poll every 5s
  const { data: msgData, isLoading: msgLoading } = useQuery({
    queryKey: ['inbox-messages', selectedId],
    queryFn: () => selectedId ? inboxApi.getMessages(selectedId).then(r => r.data.data) : null,
    enabled: !!selectedId,
    refetchInterval: 5000,
  })

  const replyMutation = useMutation({
    mutationFn: ({ id, msg }: { id: string; msg: string }) => inboxApi.sendReply(id, msg),
    onSuccess: () => {
      setReply('')
      queryClient.invalidateQueries({ queryKey: ['inbox-messages', selectedId] })
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] })
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string; error?: string } } }
      const detail = e?.response?.data?.error || e?.response?.data?.message || 'Failed to send'
      if (detail.includes('TOKEN EXPIRED') || detail.includes('190')) {
        toast.error('WhatsApp token expired — update it in Settings → WhatsApp API', { duration: 6000 })
      } else {
        toast.error(detail, { duration: 4000 })
      }
    },
  })

  const conversations = convData || []
  const selectedConv = conversations.find(c => c._id === selectedId) || null
  const messages: Message[] = msgData?.messages || []

  // Auto-scroll to bottom when messages load or change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, selectedId])

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    setMobileView('chat')
    setReply('')
  }, [])

  const handleSend = () => {
    if (!reply.trim() || !selectedId) return
    if (selectedConv?.isBlocked) { toast.error('Customer is blocked'); return }
    replyMutation.mutate({ id: selectedId, msg: reply.trim() })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = []
  messages.forEach(msg => {
    const date = formatDate(msg.createdAt)
    const last = groupedMessages[groupedMessages.length - 1]
    if (last && last.date === date) {
      last.messages.push(msg)
    } else {
      groupedMessages.push({ date, messages: [msg] })
    }
  })

  return (
    <div className="flex h-full -m-4 lg:-m-6 overflow-hidden rounded-none">
      {/* ─── LEFT PANEL: Conversation List ──────────────────────── */}
      <div className={`
        flex flex-col w-full lg:w-80 xl:w-96 bg-gray-900 border-r border-gray-800 shrink-0
        ${mobileView === 'chat' ? 'hidden lg:flex' : 'flex'}
      `}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white mb-3">Inbox</h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              className="input pl-9 text-sm py-2"
              placeholder="Search conversations..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {convLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800/50">
                <div className="w-10 h-10 bg-gray-800 rounded-full animate-pulse shrink-0" />
                <div className="flex-1">
                  <div className="h-3 bg-gray-800 rounded w-24 mb-2 animate-pulse" />
                  <div className="h-2.5 bg-gray-800 rounded w-40 animate-pulse" />
                </div>
              </div>
            ))
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center px-4">
              <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mb-3">
                <Phone size={20} className="text-gray-600" />
              </div>
              <p className="text-gray-500 text-sm">No conversations yet</p>
              <p className="text-gray-600 text-xs mt-1">Customer messages will appear here</p>
            </div>
          ) : conversations.map(conv => (
            <button
              key={conv._id}
              onClick={() => handleSelect(conv._id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-800/40 transition-colors hover:bg-gray-800/40
                ${selectedId === conv._id ? 'bg-green-500/10 border-l-2 border-l-green-500' : ''}
              `}
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm
                  ${conv.isBlocked ? 'bg-red-900/60' : 'bg-gray-700'}`}>
                  {conv.name ? conv.name.charAt(0).toUpperCase() : <User size={16} />}
                </div>
                {!conv.isBlocked && conv.optIn && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-gray-900" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <p className="text-sm font-medium text-white truncate">
                    {conv.name || conv.phone}
                  </p>
                  <span className="text-[10px] text-gray-500 shrink-0">
                    {timeAgo(conv.lastMessage?.createdAt || conv.lastMessageAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs text-gray-500 truncate">
                    {conv.lastMessage?.role === 'assistant' && (
                      <span className="text-green-500 mr-1">You:</span>
                    )}
                    {conv.lastMessage?.content || 'No messages yet'}
                  </p>
                  {conv.isBlocked && (
                    <span className="text-[9px] badge-red shrink-0">blocked</span>
                  )}
                </div>
                {conv.name && (
                  <p className="text-[10px] text-gray-600 font-mono mt-0.5">{conv.phone}</p>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Footer: online indicator */}
        <div className="px-4 py-2 border-t border-gray-800 flex items-center gap-1.5">
          <Wifi size={12} className="text-green-500" />
          <span className="text-[10px] text-gray-500">Live • auto-refreshes every 10s</span>
        </div>
      </div>

      {/* ─── RIGHT PANEL: Chat ──────────────────────────────────── */}
      <div className={`
        flex-1 flex flex-col bg-gray-950 min-w-0
        ${mobileView === 'list' ? 'hidden lg:flex' : 'flex'}
      `}>
        {!selectedConv ? (
          // Empty state
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 wa-gradient rounded-full flex items-center justify-center mb-4 shadow-lg shadow-green-500/20">
              <Phone size={32} className="text-white" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">Your Inbox</h3>
            <p className="text-gray-500 text-sm max-w-xs">
              Select a conversation from the left to view messages and reply in real-time.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3 max-w-xs w-full text-left">
              {[
                { icon: '💬', text: 'Chat bubbles with timestamps' },
                { icon: '⚡', text: 'Auto-refreshes every 5s' },
                { icon: '🤖', text: 'AI-generated messages tagged' },
                { icon: '📤', text: 'Send replies via WhatsApp' },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-start gap-2 bg-gray-900 rounded-lg p-2.5">
                  <span className="text-base">{icon}</span>
                  <span className="text-xs text-gray-400">{text}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900">
              {/* Back button (mobile) */}
              <button
                onClick={() => setMobileView('list')}
                className="lg:hidden text-gray-400 hover:text-white -ml-1 p-1"
              >
                <ArrowLeft size={20} />
              </button>

              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold shrink-0
                ${selectedConv.isBlocked ? 'bg-red-900/60' : 'bg-gray-700'}`}>
                {selectedConv.name ? selectedConv.name.charAt(0).toUpperCase() : <User size={15} />}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{selectedConv.name || selectedConv.phone}</p>
                <div className="flex items-center gap-2">
                  {selectedConv.name && (
                    <p className="text-xs text-gray-500 font-mono">{selectedConv.phone}</p>
                  )}
                  <span className={`text-[9px] ${selectedConv.isBlocked ? 'badge-red' : selectedConv.optIn ? 'badge-green' : 'badge-gray'}`}>
                    {selectedConv.isBlocked ? 'blocked' : selectedConv.optIn ? 'opted in' : 'opted out'}
                  </span>
                </div>
              </div>

              {/* Refresh indicator */}
              <div className="flex items-center gap-1.5 shrink-0">
                <WifiOff size={12} className="text-gray-600 hidden" />
                <Wifi size={12} className="text-green-500" />
                <span className="text-[10px] text-gray-500 hidden sm:block">live</span>
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {msgLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-gray-600 text-sm">No messages yet</p>
                </div>
              ) : (
                groupedMessages.map(group => (
                  <div key={group.date}>
                    {/* Date separator */}
                    <div className="flex items-center gap-3 my-3">
                      <div className="flex-1 h-px bg-gray-800" />
                      <span className="text-[10px] text-gray-600 px-2 shrink-0">{group.date}</span>
                      <div className="flex-1 h-px bg-gray-800" />
                    </div>

                    {/* Messages */}
                    <div className="space-y-1">
                      {group.messages.map((msg, idx) => {
                        const isOutgoing = msg.role === 'assistant'
                        const showAvatar = !isOutgoing && (idx === 0 || group.messages[idx - 1]?.role !== 'user')

                        return (
                          <div
                            key={msg.id}
                            className={`flex items-end gap-2 ${isOutgoing ? 'justify-end' : 'justify-start'}`}
                          >
                            {/* Incoming avatar */}
                            {!isOutgoing && (
                              <div className={`w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center shrink-0 mb-0.5 ${!showAvatar ? 'invisible' : ''}`}>
                                <User size={11} className="text-gray-400" />
                              </div>
                            )}

                            {/* Bubble */}
                            <div className={`max-w-[75%] group`}>
                              <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed
                                ${isOutgoing
                                  ? 'bg-green-600 text-white rounded-br-sm'
                                  : 'bg-gray-800 text-gray-100 rounded-bl-sm'
                                }`}
                              >
                                {msg.content || (msg.type !== 'text' ? `[${msg.type}]` : '')}
                              </div>

                              {/* Meta */}
                              <div className={`flex items-center gap-1 mt-0.5 ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                                <span className="text-[9px] text-gray-600">{formatTime(msg.createdAt)}</span>
                                {isOutgoing && (
                                  <>
                                    {msg.status === 'sent' || msg.status === 'delivered' || msg.status === 'read' ? (
                                      <CheckCheck size={10} className={msg.status === 'read' ? 'text-blue-400' : 'text-gray-500'} />
                                    ) : (
                                      <Clock size={10} className="text-gray-600" />
                                    )}
                                    {msg.aiGenerated && (
                                      <span className="text-[9px] text-purple-400">AI</span>
                                    )}
                                    {msg.isFromBroadcast && (
                                      <span className="text-[9px] text-blue-400">broadcast</span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply box */}
            <div className="px-4 py-3 border-t border-gray-800 bg-gray-900">
              {selectedConv.isBlocked ? (
                <div className="text-center text-xs text-red-400 py-2">
                  This customer is blocked. Unblock them from the Customers page to reply.
                </div>
              ) : !selectedConv.optIn ? (
                <div className="text-center text-xs text-gray-500 py-2">
                  Customer has opted out of messages.
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <textarea
                    ref={textareaRef}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-green-500/50 transition-colors min-h-[42px] max-h-32"
                    placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!reply.trim() || replyMutation.isPending}
                    className="w-10 h-10 wa-gradient rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity shadow-sm shadow-green-500/20"
                  >
                    {replyMutation.isPending ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send size={16} className="text-white" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
