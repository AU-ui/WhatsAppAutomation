import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuth } from '../../context/AuthContext'
import { getNicheConfig } from '../../config/niches'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const { tenant } = useAuth()
  const niche = getNicheConfig(tenant?.businessType)

  const pageTitles: Record<string, string> = {
    '/':           'Dashboard',
    '/inbox':      'Inbox',
    '/customers':  niche.customersLabel,
    '/products':   niche.productsLabel,
    '/orders':     niche.ordersLabel,
    '/broadcasts': niche.broadcastsLabel,
    '/flows':      'Auto Flows',
    '/analytics':  'Analytics',
    '/settings':   'Settings',
  }

  const title = Object.entries(pageTitles)
    .filter(([path]) => path !== '/' || location.pathname === '/')
    .find(([path]) => location.pathname.startsWith(path))?.[1] || 'Dashboard'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} title={title} />
        <main className={`flex-1 overflow-hidden ${location.pathname.startsWith('/inbox') ? '' : 'overflow-y-auto p-4 lg:p-6'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
