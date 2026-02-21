import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, Package, Megaphone, BarChart2,
  Zap, ShoppingBag, Settings, MessageSquare, ChevronRight, X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { getNicheConfig } from '../../config/niches'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { tenant } = useAuth()
  const location = useLocation()
  const niche = getNicheConfig(tenant?.businessType)

  const navItems = [
    { path: '/',           icon: LayoutDashboard, label: 'Dashboard',               exact: true },
    { path: '/customers',  icon: Users,           label: niche.customersLabel                   },
    { path: '/products',   icon: Package,         label: niche.productsLabel                    },
    { path: '/orders',     icon: ShoppingBag,     label: niche.ordersLabel                      },
    { path: '/broadcasts', icon: Megaphone,       label: niche.broadcastsLabel                  },
    { path: '/flows',      icon: Zap,             label: 'Auto Flows'                           },
    { path: '/analytics',  icon: BarChart2,       label: 'Analytics'                            },
    { path: '/settings',   icon: Settings,        label: 'Settings'                             },
  ]

  const planColors: Record<string, string> = {
    trial:      'badge-yellow',
    basic:      'badge-blue',
    pro:        'badge-green',
    enterprise: 'badge-gray',
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-gray-900 border-r border-gray-800 z-30
          flex flex-col transition-transform duration-300
          ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:z-auto
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 wa-gradient rounded-lg flex items-center justify-center shadow">
              <MessageSquare size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-none">WA Platform</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Automation Suite</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Tenant info */}
        <div className="px-4 py-3 border-b border-gray-800">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">Current Business</p>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{tenant?.businessName}</p>
              <p className="text-xs text-gray-500 capitalize truncate">{tenant?.businessType?.replace('_', ' ')}</p>
            </div>
            <span className={`${planColors[tenant?.subscription?.plan || 'trial']} text-[10px] ml-2 shrink-0`}>
              {tenant?.subscription?.plan?.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label, exact }) => {
            const isActive = exact ? location.pathname === path : location.pathname.startsWith(path)
            return (
              <NavLink
                key={path}
                to={path}
                onClick={onClose}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-all duration-150 group
                  ${isActive
                    ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'}
                `}
              >
                <Icon size={17} className={isActive ? 'text-green-400' : 'text-gray-500 group-hover:text-gray-300'} />
                <span className="flex-1">{label}</span>
                {isActive && <ChevronRight size={14} className="text-green-500" />}
              </NavLink>
            )
          })}
        </nav>

        {/* Usage meter */}
        {tenant && (
          <div className="px-4 py-3 border-t border-gray-800">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Messages this month</span>
              <span>{tenant.subscription.messagesUsedThisMonth.toLocaleString()}</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5">
              <div
                className="bg-green-500 h-1.5 rounded-full transition-all"
                style={{
                  width: `${Math.min(
                    (tenant.subscription.messagesUsedThisMonth / (tenant.subscription.plan === 'basic' ? 1000 : 10000)) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* WhatsApp status indicator */}
        <div className="px-4 py-3 border-t border-gray-800">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${tenant?.whatsapp?.isVerified ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-xs text-gray-500">
              {tenant?.whatsapp?.isVerified ? 'WhatsApp Connected' : 'WhatsApp Not Connected'}
            </span>
          </div>
        </div>
      </aside>
    </>
  )
}
