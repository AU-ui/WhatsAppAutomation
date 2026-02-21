import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../services/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Save, Wifi, Bot, Building, Clock, Link2, Eye, EyeOff } from 'lucide-react'

const TONES = ['friendly', 'professional', 'casual', 'formal']
const TIMEZONES = ['UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'Asia/Singapore', 'Asia/Jakarta']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
type DayHours = { day: string; open: string; close: string; closed: boolean }

export default function Settings() {
  const { tenant } = useAuth()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('business')

  const TABS = [
    { id: 'business',      label: 'Business',     icon: Building },
    { id: 'whatsapp',      label: 'WhatsApp API',  icon: Wifi },
    { id: 'ai',            label: 'AI Settings',   icon: Bot },
    { id: 'hours',         label: 'Hours',         icon: Clock },
    { id: 'integrations',  label: 'Integrations',  icon: Link2 },
  ]

  // ── Business profile ──
  const [bizForm, setBizForm] = useState({
    businessName: tenant?.businessName || '',
    phone: tenant?.phone || '',
    website: tenant?.website || '',
    address: tenant?.address || '',
    currency: tenant?.currency || 'USD',
  })

  const bizMutation = useMutation({
    mutationFn: () => authApi.updateProfile(bizForm),
    onSuccess: () => { toast.success('Profile saved!'); queryClient.invalidateQueries({ queryKey: ['me'] }) },
    onError: () => toast.error('Save failed'),
  })

  // ── WhatsApp credentials ──
  const [waForm, setWaForm] = useState({
    phoneNumberId: tenant?.whatsapp?.phoneNumberId || '',
    accessToken: '',
    webhookVerifyToken: '',
    displayName: tenant?.whatsapp?.displayName || '',
  })

  const waMutation = useMutation({
    mutationFn: () => authApi.updateWhatsApp(waForm),
    onSuccess: (res) => {
      const verified = res.data.verified
      toast.success(verified ? 'WhatsApp connected and verified!' : 'Credentials saved (verification pending)')
      queryClient.invalidateQueries({ queryKey: ['me'] })
    },
    onError: () => toast.error('Failed to save WhatsApp credentials'),
  })

  // ── AI Settings ──
  const settings = (tenant?.settings || {}) as Record<string, unknown>
  const [aiForm, setAiForm] = useState({
    aiEnabled: (settings.aiEnabled as boolean) ?? true,
    brandTone: (settings.brandTone as string) || 'friendly',
    aiPersonality: (settings.aiPersonality as string) || '',
    welcomeMessage: (settings.welcomeMessage as string) || '',
    awayMessage: (settings.awayMessage as string) || '',
    handoffKeywords: ((settings.handoffKeywords as string[]) || []).join(', '),
  })

  const aiMutation = useMutation({
    mutationFn: () => authApi.updateSettings({
      ...aiForm,
      handoffKeywords: aiForm.handoffKeywords.split(',').map(k => k.trim()).filter(Boolean),
    }),
    onSuccess: () => toast.success('AI settings saved!'),
    onError: () => toast.error('Save failed'),
  })

  // ── Business Hours ──
  const existingHours = settings.businessHours as { enabled?: boolean; timezone?: string; schedule?: DayHours[] } | undefined
  const [hoursEnabled, setHoursEnabled] = useState(existingHours?.enabled ?? false)
  const [hoursTimezone, setHoursTimezone] = useState(existingHours?.timezone || 'UTC')
  const [hoursSchedule, setHoursSchedule] = useState<DayHours[]>(() =>
    DAYS.map(day => {
      const existing = existingHours?.schedule?.find(s => s.day === day)
      return existing || { day, open: '09:00', close: '18:00', closed: day === 'Saturday' || day === 'Sunday' }
    })
  )

  const hoursMutation = useMutation({
    mutationFn: () => authApi.updateSettings({
      businessHours: { enabled: hoursEnabled, timezone: hoursTimezone, schedule: hoursSchedule },
    }),
    onSuccess: () => toast.success('Business hours saved!'),
    onError: () => toast.error('Save failed'),
  })

  const updateDay = (day: string, field: keyof DayHours, value: string | boolean) => {
    setHoursSchedule(prev => prev.map(d => d.day === day ? { ...d, [field]: value } : d))
  }

  // ── Integrations (Facebook Lead Ads) ──
  const [showToken, setShowToken] = useState(false)
  const [intForm, setIntForm] = useState({
    facebookPageId: (settings.facebookPageId as string) || '',
    facebookPageAccessToken: (settings.facebookPageAccessToken as string) || '',
    facebookLeadWelcomeMessage: (settings.facebookLeadWelcomeMessage as string) || '',
  })

  const intMutation = useMutation({
    mutationFn: () => authApi.updateSettings(intForm),
    onSuccess: () => toast.success('Integration settings saved!'),
    onError: () => toast.error('Save failed'),
  })

  return (
    <div className="max-w-2xl space-y-5">
      {/* Tab nav */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
              activeTab === id
                ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon size={13} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Business Profile ── */}
      {activeTab === 'business' && (
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-white">Business Profile</h3>
          {[
            { label: 'Business Name', field: 'businessName', placeholder: 'Your business name' },
            { label: 'Phone', field: 'phone', placeholder: '+1 234 567 8900' },
            { label: 'Website', field: 'website', placeholder: 'https://yourbusiness.com' },
            { label: 'Address', field: 'address', placeholder: '123 Main St, City, Country' },
          ].map(({ label, field, placeholder }) => (
            <div key={field}>
              <label className="label">{label}</label>
              <input className="input" placeholder={placeholder}
                value={bizForm[field as keyof typeof bizForm]}
                onChange={e => setBizForm(f => ({ ...f, [field]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label className="label">Currency</label>
            <select className="input" value={bizForm.currency}
              onChange={e => setBizForm(f => ({ ...f, currency: e.target.value }))}>
              {['USD', 'EUR', 'GBP', 'INR', 'AED', 'SAR', 'SGD', 'MYR', 'IDR', 'PKR'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <button onClick={() => bizMutation.mutate()} disabled={bizMutation.isPending} className="btn-primary">
            <Save size={14} /> {bizMutation.isPending ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      )}

      {/* ── WhatsApp API ── */}
      {activeTab === 'whatsapp' && (
        <div className="card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-white">WhatsApp Cloud API</h3>
            <span className={`text-[10px] ${tenant?.whatsapp?.isVerified ? 'badge-green' : 'badge-red'}`}>
              {tenant?.whatsapp?.isVerified ? 'Connected' : 'Not Connected'}
            </span>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300 space-y-1">
            <p className="font-medium">How to get Meta credentials:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-blue-300/80">
              <li>Go to <strong>developers.facebook.com</strong> → Create App</li>
              <li>Add WhatsApp Business product</li>
              <li>Copy the <strong>Phone Number ID</strong></li>
              <li>Generate a <strong>Permanent Access Token</strong></li>
              <li>Set webhook URL: <code className="bg-blue-900/40 px-1 rounded">https://yourdomain.com/api/webhook</code></li>
              <li>Use the Verify Token below in Meta webhook config</li>
            </ol>
          </div>

          {[
            { label: 'Phone Number ID *', field: 'phoneNumberId', placeholder: '1234567890123456' },
            { label: 'Display Name', field: 'displayName', placeholder: 'Your WhatsApp display name' },
            { label: 'Permanent Access Token *', field: 'accessToken', placeholder: 'EAA...' },
            { label: 'Webhook Verify Token', field: 'webhookVerifyToken', placeholder: 'Custom token for webhook verification' },
          ].map(({ label, field, placeholder }) => (
            <div key={field}>
              <label className="label">{label}</label>
              <input
                className="input font-mono text-xs"
                type={field.includes('Token') ? 'password' : 'text'}
                placeholder={placeholder}
                value={waForm[field as keyof typeof waForm]}
                onChange={e => setWaForm(f => ({ ...f, [field]: e.target.value }))}
              />
            </div>
          ))}

          <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-400">
            <p className="font-medium text-gray-300 mb-1">Your Webhook URL:</p>
            <code className="text-green-400">https://yourdomain.com/api/webhook</code>
            <p className="mt-1 text-gray-600">Subscribe to: <code>messages</code></p>
          </div>

          <button onClick={() => waMutation.mutate()} disabled={waMutation.isPending} className="btn-primary">
            <Wifi size={14} /> {waMutation.isPending ? 'Saving...' : 'Save & Verify'}
          </button>
        </div>
      )}

      {/* ── AI Settings ── */}
      {activeTab === 'ai' && (
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-white">AI & Auto-Reply Settings</h3>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm text-white">Enable AI Auto-Reply</p>
              <p className="text-xs text-gray-500">Use GPT to handle messages that don't match any flow</p>
            </div>
            <button
              onClick={() => setAiForm(f => ({ ...f, aiEnabled: !f.aiEnabled }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                aiForm.aiEnabled ? 'bg-green-500' : 'bg-gray-700'
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                aiForm.aiEnabled ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
          </label>

          <div>
            <label className="label">Brand Tone</label>
            <div className="grid grid-cols-4 gap-2">
              {TONES.map(tone => (
                <button key={tone}
                  onClick={() => setAiForm(f => ({ ...f, brandTone: tone }))}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${
                    aiForm.brandTone === tone
                      ? 'bg-green-500/15 text-green-400 border-green-500/30'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {tone}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">AI Personality (optional)</label>
            <textarea className="input resize-none" rows={2}
              placeholder="e.g. Speak like a luxury hotel concierge with deep knowledge of local attractions..."
              value={aiForm.aiPersonality}
              onChange={e => setAiForm(f => ({ ...f, aiPersonality: e.target.value }))} />
          </div>

          <div>
            <label className="label">Welcome Message</label>
            <textarea className="input resize-none" rows={3}
              placeholder="Message sent to new customers. Use {BUSINESS_NAME} as placeholder."
              value={aiForm.welcomeMessage}
              onChange={e => setAiForm(f => ({ ...f, welcomeMessage: e.target.value }))} />
          </div>

          <div>
            <label className="label">Away Message</label>
            <textarea className="input resize-none" rows={2}
              placeholder="Sent when business hours are closed..."
              value={aiForm.awayMessage}
              onChange={e => setAiForm(f => ({ ...f, awayMessage: e.target.value }))} />
          </div>

          <div>
            <label className="label">Human Handoff Keywords</label>
            <input className="input" placeholder="human, agent, manager, representative (comma-separated)"
              value={aiForm.handoffKeywords}
              onChange={e => setAiForm(f => ({ ...f, handoffKeywords: e.target.value }))} />
            <p className="text-[10px] text-gray-600 mt-1">
              When customer types any of these words, AI will suggest connecting with a human agent
            </p>
          </div>

          <button onClick={() => aiMutation.mutate()} disabled={aiMutation.isPending} className="btn-primary">
            <Save size={14} /> {aiMutation.isPending ? 'Saving...' : 'Save AI Settings'}
          </button>
        </div>
      )}

      {/* ── Business Hours ── */}
      {activeTab === 'hours' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Business Hours</h3>
            <button
              onClick={() => setHoursEnabled(e => !e)}
              className={`relative w-10 h-5 rounded-full transition-colors ${hoursEnabled ? 'bg-green-500' : 'bg-gray-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${hoursEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <p className="text-xs text-gray-500">
            When enabled, customers outside business hours will receive the Away Message.
          </p>

          <div>
            <label className="label">Timezone</label>
            <select className="input" value={hoursTimezone} onChange={e => setHoursTimezone(e.target.value)}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            {hoursSchedule.map(({ day, open, close, closed }) => (
              <div key={day} className={`flex items-center gap-3 ${closed ? 'opacity-50' : ''}`}>
                <span className="text-xs text-gray-400 w-24">{day}</span>
                <input
                  type="time" value={open} disabled={closed}
                  onChange={e => updateDay(day, 'open', e.target.value)}
                  className="input py-1 w-28 text-xs"
                />
                <span className="text-gray-600 text-xs">to</span>
                <input
                  type="time" value={close} disabled={closed}
                  onChange={e => updateDay(day, 'close', e.target.value)}
                  className="input py-1 w-28 text-xs"
                />
                <label className="flex items-center gap-1.5 cursor-pointer ml-auto">
                  <input
                    type="checkbox" className="accent-red-500"
                    checked={closed}
                    onChange={e => updateDay(day, 'closed', e.target.checked)}
                  />
                  <span className="text-xs text-gray-500">Closed</span>
                </label>
              </div>
            ))}
          </div>

          <button onClick={() => hoursMutation.mutate()} disabled={hoursMutation.isPending} className="btn-primary">
            <Save size={14} /> {hoursMutation.isPending ? 'Saving...' : 'Save Hours'}
          </button>
        </div>
      )}

      {/* ── Integrations (Facebook Lead Ads) ── */}
      {activeTab === 'integrations' && (
        <div className="card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-white">Facebook / Instagram Lead Ads</h3>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300 space-y-1">
            <p className="font-medium">Setup Instructions:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-blue-300/80">
              <li>Go to <strong>Meta Business Suite</strong> → All Tools → Instant Forms</li>
              <li>Open your Facebook Page settings → Subscribed Apps → Webhooks</li>
              <li>Add the Webhook URL below and paste your <strong>Verify Token</strong></li>
              <li>Subscribe to the <code className="bg-blue-900/40 px-1 rounded">leadgen</code> field</li>
              <li>Paste your <strong>Page ID</strong> and <strong>Page Access Token</strong> below and save</li>
            </ol>
          </div>

          <div>
            <label className="label">Webhook URL (paste this in Meta)</label>
            <div className="bg-gray-800 rounded-lg p-3 text-xs">
              <code className="text-green-400 break-all">https://yourdomain.com/api/webhook/fb-leads</code>
              <p className="text-gray-500 mt-1">Verify Token: use the same token set in your <code>.env</code> as <code>META_VERIFY_TOKEN</code></p>
            </div>
          </div>

          <div>
            <label className="label">Facebook Page ID</label>
            <input
              className="input font-mono text-xs"
              placeholder="e.g. 123456789012345"
              value={intForm.facebookPageId}
              onChange={e => setIntForm(f => ({ ...f, facebookPageId: e.target.value }))}
            />
          </div>

          <div>
            <label className="label">Facebook Page Access Token</label>
            <div className="relative">
              <input
                className="input font-mono text-xs pr-10"
                type={showToken ? 'text' : 'password'}
                placeholder="EAA..."
                value={intForm.facebookPageAccessToken}
                onChange={e => setIntForm(f => ({ ...f, facebookPageAccessToken: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => setShowToken(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div>
            <label className="label">Lead Welcome Message</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder={`Hi {{name}}! Thanks for your interest. We'll be in touch shortly.\n\nReply MENU to explore what we offer.`}
              value={intForm.facebookLeadWelcomeMessage}
              onChange={e => setIntForm(f => ({ ...f, facebookLeadWelcomeMessage: e.target.value }))}
            />
            <p className="text-[10px] text-gray-600 mt-1">
              Use <code className="text-gray-400">{'{{name}}'}</code> to personalise with the lead's name
            </p>
          </div>

          <button onClick={() => intMutation.mutate()} disabled={intMutation.isPending} className="btn-primary">
            <Save size={14} /> {intMutation.isPending ? 'Saving...' : 'Save Integration Settings'}
          </button>
        </div>
      )}

      {/* Subscription info */}
      <div className="card border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white capitalize">
              {tenant?.subscription?.plan} Plan
            </p>
            <p className="text-xs text-gray-500 mt-0.5 capitalize">
              Status: {tenant?.subscription?.status}
            </p>
          </div>
          <button className="btn-primary text-xs py-1.5">
            Upgrade Plan
          </button>
        </div>
      </div>
    </div>
  )
}
