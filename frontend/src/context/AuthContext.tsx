import React, { createContext, useContext, useState, useEffect } from 'react'
import { authApi } from '../services/api'

interface Tenant {
  id: string
  businessName: string
  businessType: string
  email: string
  phone?: string
  website?: string
  address?: string
  currency?: string
  logoUrl?: string
  role: string
  subscription: { plan: string; status: string; messagesUsedThisMonth: number }
  whatsapp: { phoneNumberId: string; displayName?: string; isVerified: boolean; webhookVerifyToken?: string }
  settings: Record<string, unknown>
}

interface AuthContextType {
  tenant: Tenant | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token')
      if (!storedToken) {
        setIsLoading(false)
        return
      }
      try {
        const { data } = await authApi.getMe()
        setTenant(data.tenant)
      } catch {
        localStorage.removeItem('token')
        setToken(null)
      } finally {
        setIsLoading(false)
      }
    }
    initAuth()
  }, [])

  const login = async (email: string, password: string) => {
    const { data } = await authApi.login(email, password)
    localStorage.setItem('token', data.token)
    setToken(data.token)
    setTenant(data.tenant)
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setTenant(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{
      tenant,
      token,
      login,
      logout,
      isLoading,
      isAuthenticated: !!tenant,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
