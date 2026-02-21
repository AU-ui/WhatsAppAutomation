import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { MessageSquare, Eye, EyeOff, Loader2, ShieldCheck, Lock } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState(0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Please fill in all fields')
      return
    }
    setLoading(true)
    try {
      await login(email, password)
      toast.success('Welcome back!')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string }; status?: number } }
      setAttempts(a => a + 1)
      if (!error?.response) {
        toast.error('Cannot connect to backend — run: cd backend && npm run dev', { duration: 7000 })
      } else if (error.response.status === 429) {
        toast.error(error.response.data?.message || 'Too many attempts', { duration: 8000 })
      } else {
        toast.error(error.response.data?.message || 'Invalid email or password')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-green-500/8 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-emerald-500/6 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-0 w-[300px] h-[300px] bg-teal-500/5 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '4s' }} />
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: 'linear-gradient(#25d366 1px, transparent 1px), linear-gradient(90deg, #25d366 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />
      </div>

      <div className="w-full max-w-[400px] relative z-10">
        {/* Logo card */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 wa-gradient rounded-2xl flex items-center justify-center shadow-lg shadow-green-500/30">
              <MessageSquare size={22} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-lg font-bold text-white leading-tight">WA Platform</p>
              <p className="text-xs text-gray-500">Business Automation</p>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your dashboard</p>
        </div>

        {/* Glassmorphism card */}
        <div className="relative">
          <div className="absolute inset-0 bg-green-500/5 rounded-2xl blur-sm" />
          <div className="relative bg-gray-900/80 backdrop-blur-xl border border-gray-800/80 rounded-2xl p-7 shadow-2xl shadow-black/40">
            {/* Security badge */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold text-white">Sign in</h2>
              <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-2.5 py-1">
                <ShieldCheck size={11} className="text-green-400" />
                <span className="text-[10px] text-green-400 font-medium">Secured</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1.5">Email address</label>
                <input
                  type="email"
                  className="w-full bg-gray-800/60 border border-gray-700/60 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:bg-gray-800 transition-all"
                  placeholder="you@business.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              {/* Password */}
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full bg-gray-800/60 border border-gray-700/60 rounded-xl px-4 py-2.5 pr-11 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:bg-gray-800 transition-all"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
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
              </div>

              {/* Lock warning after multiple failures */}
              {attempts >= 3 && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <Lock size={12} className="text-red-400 shrink-0" />
                  <p className="text-[11px] text-red-400">
                    Account locks after 5 failed attempts (15 min lockout)
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full wa-gradient text-white text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-60 shadow-lg shadow-green-500/20 mt-2"
              >
                {loading ? (
                  <><Loader2 size={16} className="animate-spin" /> Signing in...</>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-gray-800/60 text-center">
              <p className="text-xs text-gray-600">
                New to the platform?{' '}
                <Link to="/register" className="text-green-400 hover:text-green-300 font-medium transition-colors">
                  Create free account
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Business type pills */}
        <div className="flex flex-wrap justify-center gap-2 mt-5">
          {['Hotels', 'Restaurants', 'Grocery', 'Clinics', 'Real Estate', 'Salons'].map((t) => (
            <span key={t} className="text-[10px] text-gray-700 bg-gray-900/50 border border-gray-800/60 px-2.5 py-0.5 rounded-full backdrop-blur">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
