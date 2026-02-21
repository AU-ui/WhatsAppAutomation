import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor: attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor: handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('tenant')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ─── Auth ─────────────────────────────────────────────────────────
export const authApi = {
  register: (data: Record<string, string>) => api.post('/auth/register', data),
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data: Record<string, string>) => api.patch('/auth/profile', data),
  updateSettings: (settings: Record<string, unknown>) => api.patch('/auth/settings', { settings }),
  updateWhatsApp: (data: Record<string, string>) => api.patch('/auth/whatsapp', data),
}

// ─── Customers ────────────────────────────────────────────────────
export const customersApi = {
  list: (params?: Record<string, unknown>) => api.get('/customers', { params }),
  get: (id: string) => api.get(`/customers/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/customers/${id}`, data),
  block: (id: string, reason?: string) => api.post(`/customers/${id}/block`, { reason }),
  unblock: (id: string) => api.post(`/customers/${id}/unblock`),
  sendMessage: (id: string, message: string) => api.post(`/customers/${id}/message`, { message }),
  getStats: () => api.get('/customers/stats'),
}

// ─── Products ─────────────────────────────────────────────────────
export const productsApi = {
  list: (params?: Record<string, unknown>) => api.get('/products', { params }),
  get: (id: string) => api.get(`/products/${id}`),
  create: (data: Record<string, unknown>) => api.post('/products', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
  bulkUpdateStock: (updates: { productId: string; stock: number }[]) =>
    api.post('/products/bulk-stock', { updates }),
  getCategories: () => api.get('/products/categories/all'),
  createCategory: (data: Record<string, unknown>) => api.post('/products/categories', data),
  updateCategory: (id: string, data: Record<string, unknown>) => api.patch(`/products/categories/${id}`, data),
  deleteCategory: (id: string) => api.delete(`/products/categories/${id}`),
}

// ─── Broadcasts ───────────────────────────────────────────────────
export const broadcastsApi = {
  list: (params?: Record<string, unknown>) => api.get('/broadcasts', { params }),
  get: (id: string) => api.get(`/broadcasts/${id}`),
  create: (data: Record<string, unknown>) => api.post('/broadcasts', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/broadcasts/${id}`, data),
  schedule: (id: string, scheduledAt: string) => api.post(`/broadcasts/${id}/schedule`, { scheduledAt }),
  sendNow: (id: string) => api.post(`/broadcasts/${id}/send-now`),
  cancel: (id: string) => api.post(`/broadcasts/${id}/cancel`),
  getStats: (id: string) => api.get(`/broadcasts/${id}/stats`),
  estimateAudience: (audience: Record<string, unknown>) => api.post('/broadcasts/estimate-audience', { audience }),
  getTemplates: () => api.get('/broadcasts/templates'),
}

// ─── Analytics ────────────────────────────────────────────────────
export const analyticsApi = {
  getDashboard: () => api.get('/analytics/dashboard'),
  getTrend: (days?: number) => api.get('/analytics/trend', { params: { days } }),
  getTopCustomers: () => api.get('/analytics/top-customers'),
  getRevenue: (period?: string) => api.get('/analytics/revenue', { params: { period } }),
  getFunnel: () => api.get('/analytics/funnel'),
}

// ─── Auto Flows ───────────────────────────────────────────────────
export const flowsApi = {
  list: () => api.get('/flows'),
  get: (id: string) => api.get(`/flows/${id}`),
  create: (data: Record<string, unknown>) => api.post('/flows', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/flows/${id}`, data),
  delete: (id: string) => api.delete(`/flows/${id}`),
  toggle: (id: string) => api.post(`/flows/${id}/toggle`),
  getDefaults: (businessType?: string) => api.get('/flows/defaults', { params: { businessType } }),
}

// ─── Orders ───────────────────────────────────────────────────────
export const ordersApi = {
  list: (params?: Record<string, unknown>) => api.get('/orders', { params }),
  get: (id: string) => api.get(`/orders/${id}`),
  updateStatus: (id: string, status: string) => api.patch(`/orders/${id}/status`, { status }),
  sendReminder: (id: string) => api.post(`/orders/${id}/send-reminder`),
}

// ─── Templates ────────────────────────────────────────────────────
export const templatesApi = {
  list: () => api.get('/templates'),
  create: (data: Record<string, unknown>) => api.post('/templates', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/templates/${id}`, data),
  delete: (id: string) => api.delete(`/templates/${id}`),
}

export default api
