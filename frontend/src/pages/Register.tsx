import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { MessageSquare, Eye, EyeOff, Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { authApi } from '../services/api'
import toast from 'react-hot-toast'

const BUSINESS_TYPES = [
  { value: 'hotel',              label: '🏨 Hotel / Guest House' },
  { value: 'restaurant',         label: '🍽️ Restaurant / Food' },
  { value: 'grocery',            label: '🛒 Grocery / Supermarket' },
  { value: 'retail',             label: '🏪 Retail / E-commerce' },
  { value: 'clinic',             label: '🏥 Clinic / Healthcare' },
  { value: 'salon',              label: '💅 Salon / Spa / Beauty' },
  { value: 'real_estate',        label: '🏠 Real Estate / Property' },
  { value: 'agency_travel',      label: '✈️ Travel Agency' },
  { value: 'agency_recruitment', label: '💼 Recruitment Agency' },
  { value: 'wholesaler',         label: '📦 Wholesaler / Distributor' },
  { value: 'general',            label: '🏢 General Business' },
]

function passwordStrength(pwd: string): { score: number; label: string; color: string } {
  let score = 0
  if (pwd.length >= 8) score++
  if (pwd.length >= 12) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++

  if (score <= 1) return { score, label: 'Weak', color: 'bg-red-500' }
  if (score <= 2) return { score, label: 'Fair', color: 'bg-yellow-500' }
  if (score <= 3) return { score, label: 'Good', color: 'bg-blue-500' }
  return { score, label: 'Strong', color: 'bg-green-500' }
}

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    businessName: '',
    businessType: 'general',
    email: '',
    password: '',
    phone: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.businessName || !form.email || !form.password) {
      toast.error('Please fill in all required fields')
      return
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      const { data } = await authApi.register(form)
      localStorage.setItem('token', data.token)
      toast.success(`Welcome, ${form.businessName}! Your dashboard is ready.`)
      navigate('/')
      window.location.reload()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      toast.error(error?.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const pwd = passwordStrength(form.password)

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/3 w-[500px] h-[500px] bg-green-500/8 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] bg-emerald-500/6 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: 'linear-gradient(#25d366 1px, transparent 1px), linear-gradient(90deg, #25d366 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />
      </div>

      <div className="w-full max-w-[420px] relative z-10 my-4">
        {/* Logo */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-11 h-11 wa-gradient rounded-xl flex items-center justify-center shadow-lg shadow-green-500/30">
              <MessageSquare size={20} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-base font-bold text-white leading-tight">WA Platform</p>
              <p className="text-xs text-gray-500">Business Automation</p>
            </div>
          </div>
          <h1 className="text-xl font-bold text-white">Create your account</h1>
          <p className="text-gray-500 text-sm mt-1">Set up your WhatsApp automation in 60 seconds</p>
        </div>

        {/* Glassmorphism card */}
        <div className="relative">
          <div className="absolute inset-0 bg-green-500/5 rounded-2xl blur-sm" />
          <div className="relative bg-gray-900/80 backdrop-blur-xl border border-gray-800/80 rounded-2xl p-6 shadow-2xl shadow-black/40">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-white">Business Details</h2>
              <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-2.5 py-1">
                <ShieldCheck size={11} className="text-green-400" />
                <span className="text-[10px] text-green-400 font-medium">Free forever</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Business Name */}
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1.5">Business Name *</label>
                <input
                  name="businessName"
                  type="text"
                  className="w-full bg-gray-800/60 border border-gray-700/60 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:bg-gray-800 transition-all"
                  placeholder="e.g. The Grand Hotel"
                  value={form.businessName}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* Business Type */}
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1.5">Business Type *</label>
                <select
                  name="businessType"
                  className="w-full bg-gray-800/60 border border-gray-700/60 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50 focus:bg-gray-800 transition-all appearance-none"
                  value={form.businessType}
                  onChange={handleChange}
                >
                  {BUSINESS_TYPES.map(bt => (
                    <option key={bt.value} value={bt.value}>{bt.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-600 mt-1 pl-1">
                  Customises your WhatsApp menu, offer templates & product types automatically
                </p>
              </div>

              {/* Email */}
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1.5">Email *</label>
                <input
                  name="email"
                  type="email"
                  className="w-full bg-gray-800/60 border border-gray-700/60 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:bg-gray-800 transition-all"
                  placeholder="you@business.com"
                  value={form.email}
                  onChange={handleChange}
                  autoComplete="email"
                  required
                />
              </div>

              {/* Password */}
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1.5">Password *</label>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    className="w-full bg-gray-800/60 border border-gray-700/60 rounded-xl px-4 py-2.5 pr-11 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:bg-gray-800 transition-all"
                    placeholder="Min. 8 characters"
                    value={form.password}
                    onChange={handleChange}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {/* Password strength meter */}
                {form.password && (
                  <div className="mt-2">
                    <div className="flex gap-1 mb-1">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-all ${i <= pwd.score ? pwd.color : 'bg-gray-800'}`}
                        />
                      ))}
                    </div>
                    <p className={`text-[10px] pl-0.5 ${pwd.score <= 1 ? 'text-red-400' : pwd.score <= 2 ? 'text-yellow-400' : pwd.score <= 3 ? 'text-blue-400' : 'text-green-400'}`}>
                      {pwd.label} password
                      {pwd.score < 3 && ' — add uppercase, numbers, or symbols'}
                    </p>
                  </div>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1.5">
                  Phone <span className="text-gray-600">(optional)</span>
                </label>
                <input
                  name="phone"
                  type="tel"
                  className="w-full bg-gray-800/60 border border-gray-700/60 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:bg-gray-800 transition-all"
                  placeholder="+91 98765 43210"
                  value={form.phone}
                  onChange={handleChange}
                />
              </div>

              <button
                type="submit"
                disabled={loading || form.password.length < 8}
                className="w-full wa-gradient text-white text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-green-500/20 mt-1"
              >
                {loading ? (
                  <><Loader2 size={16} className="animate-spin" /> Creating account...</>
                ) : (
                  'Create Free Account'
                )}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-gray-800/60 text-center">
              <p className="text-xs text-gray-600">
                Already have an account?{' '}
                <Link to="/login" className="text-green-400 hover:text-green-300 font-medium transition-colors">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* What you get */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            '🤖 AI-powered auto replies',
            '📣 Bulk WhatsApp broadcasts',
            '🎯 Niche-specific templates',
            '📊 Customer CRM & analytics',
          ].map(item => (
            <div key={item} className="flex items-center gap-1.5 bg-gray-900/60 border border-gray-800/40 rounded-lg px-2.5 py-1.5 backdrop-blur">
              <CheckCircle2 size={11} className="text-green-500 shrink-0" />
              <span className="text-[10px] text-gray-500">{item.substring(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
