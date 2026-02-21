import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

const pageTitles: Record<string, string> = {
  '/':           'Dashboard',
  '/customers':  'Customers',
  '/products':   'Catalog & Products',
  '/orders':     'Orders',
  '/broadcasts': 'Broadcasts & Campaigns',
  '/flows':      'Auto Flows',
  '/analytics':  'Analytics',
  '/settings':   'Settings',
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  const title = Object.entries(pageTitles)
    .filter(([path]) => path !== '/' || location.pathname === '/')
    .find(([path]) => location.pathname.startsWith(path))?.[1] || 'Dashboard'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} title={title} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
