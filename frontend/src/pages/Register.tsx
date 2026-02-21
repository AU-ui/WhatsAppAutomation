import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { MessageSquare, Eye, EyeOff, Loader2 } from 'lucide-react'
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
    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      const { data } = await authApi.register(form)
      localStorage.setItem('token', data.token)
      toast.success(`Welcome to WhatsApp Platform, ${form.businessName}!`)
      navigate('/')
      window.location.reload()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      toast.error(error?.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-green-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-green-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 wa-gradient rounded-2xl shadow-lg shadow-green-500/20 mb-4">
            <MessageSquare size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">WhatsApp Platform</h1>
          <p className="text-gray-500 text-sm mt-1">Create your automation dashboard</p>
        </div>

        {/* Form */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-6">Register your business</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Business Name *</label>
              <input
                name="businessName"
                type="text"
                className="input"
                placeholder="e.g. The Grand Hotel"
                value={form.businessName}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label className="label">Business Type *</label>
              <select
                name="businessType"
                className="input"
                value={form.businessType}
                onChange={handleChange}
              >
                {BUSINESS_TYPES.map(bt => (
                  <option key={bt.value} value={bt.value}>{bt.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-600 mt-1">
                This sets your WhatsApp menu, templates, and offer messages automatically
              </p>
            </div>

            <div>
              <label className="label">Email *</label>
              <input
                name="email"
                type="email"
                className="input"
                placeholder="you@business.com"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="label">Password *</label>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="Min. 6 characters"
                  value={form.password}
                  onChange={handleChange}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="label">Phone (optional)</label>
              <input
                name="phone"
                type="tel"
                className="input"
                placeholder="+91 98765 43210"
                value={form.phone}
                onChange={handleChange}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5 mt-2"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Creating account...</>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-800 text-center">
            <p className="text-xs text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="text-green-400 hover:text-green-300 font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        {/* What changes per niche */}
        <div className="mt-4 card text-xs text-gray-500 space-y-1">
          <p className="text-gray-400 font-medium mb-2">Your niche unlocks:</p>
          <p>🤖 Custom WhatsApp reply menu (BOOK, ORDER, ROOMS...)</p>
          <p>🎁 Niche-specific offer broadcast messages</p>
          <p>📋 Tailored product types (rooms, services, packages...)</p>
        </div>
      </div>
    </div>
  )
}
