import { Menu, Bell, LogOut, User, RefreshCw } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

interface HeaderProps {
  onMenuClick: () => void
  title: string
}

export default function Header({ onMenuClick, title }: HeaderProps) {
  const { tenant, logout } = useAuth()
  const queryClient = useQueryClient()

  const handleRefresh = () => {
    queryClient.invalidateQueries()
    toast.success('Data refreshed')
  }

  return (
    <header className="sticky top-0 z-10 bg-gray-950/90 backdrop-blur-sm border-b border-gray-800 px-4 lg:px-6 py-3">
      <div className="flex items-center justify-between">
        {/* Left: hamburger + title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <Menu size={20} />
          </button>
          <h1 className="text-base font-semibold text-white">{title}</h1>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {/* Refresh */}
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            title="Refresh data"
          >
            <RefreshCw size={16} />
          </button>

          {/* Notifications (placeholder) */}
          <button className="relative p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-green-400 rounded-full" />
          </button>

          {/* Profile */}
          <div className="flex items-center gap-2 pl-2 border-l border-gray-800">
            <div className="w-7 h-7 bg-green-500/20 border border-green-500/30 rounded-full flex items-center justify-center">
              <User size={13} className="text-green-400" />
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-medium text-white leading-none">{tenant?.businessName}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{tenant?.email}</p>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors ml-1"
              title="Logout"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
