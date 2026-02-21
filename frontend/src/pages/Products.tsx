import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Search, Star, Package } from 'lucide-react'
import { productsApi } from '../services/api'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { getNicheConfig } from '../config/niches'
import BroadcastFlowModal, { PendingBroadcast } from '../components/BroadcastFlowModal'

type ProductForm = {
  name: string; description: string; price: string; discountedPrice: string;
  stock: string; type: string; categoryId: string; sku: string;
  imageUrl: string; pdfUrl: string; unit: string; isActive: boolean;
  isFeatured: boolean; notifyOnAdd: boolean;
}

const EMPTY_FORM: ProductForm = {
  name: '', description: '', price: '', discountedPrice: '', stock: '-1',
  type: 'product', categoryId: '', sku: '', imageUrl: '', pdfUrl: '',
  unit: 'piece', isActive: true, isFeatured: false, notifyOnAdd: false,
}

function ProductModal({
  product, categories, onClose, businessType,
}: {
  product?: Record<string, unknown> | null
  categories: { _id: string; name: string; emoji: string }[]
  onClose: (pending?: PendingBroadcast | null, isOffer?: boolean) => void
  businessType?: string
}) {
  const niche = getNicheConfig(businessType)
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ProductForm>(
    product ? {
      name: product.name as string || '',
      description: product.description as string || '',
      price: String(product.price || ''),
      discountedPrice: String(product.discountedPrice || ''),
      stock: String(product.stock ?? '-1'),
      type: product.type as string || 'product',
      categoryId: (product.categoryId as { _id: string })?._id || product.categoryId as string || '',
      sku: product.sku as string || '',
      imageUrl: product.imageUrl as string || '',
      pdfUrl: product.pdfUrl as string || '',
      unit: product.unit as string || 'piece',
      isActive: product.isActive as boolean ?? true,
      isFeatured: product.isFeatured as boolean ?? false,
      notifyOnAdd: product.notifyOnAdd as boolean ?? false,
    } : EMPTY_FORM
  )

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      product
        ? productsApi.update(product._id as string, data)
        : productsApi.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(product ? 'Product updated!' : 'Product created!')
      const pending = res.data?.pendingBroadcast as PendingBroadcast | null
      onClose(pending || null, !!(res.data?.data as Record<string, unknown>)?.discountedPrice)
    },
    onError: () => toast.error('Failed to save product'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({
      ...form,
      price: parseFloat(form.price),
      discountedPrice: form.discountedPrice ? parseFloat(form.discountedPrice) : undefined,
      stock: parseInt(form.stock),
    })
  }

  const f = (field: keyof ProductForm) => ({
    value: form[field] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value })),
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-lg my-4">
        <h3 className="text-base font-semibold text-white mb-5">
          {product ? 'Edit Product' : 'Add New Product'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">{niche.productsLabel.replace('& ', '').replace('s', '')} Name *</label>
              <input className="input" placeholder={`e.g. ${niche.productTypes[0]?.label.replace(/[^\w\s]/g, '').trim()}`} required {...f('name')} />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" {...f('type')}>
                {niche.productTypes.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" {...f('categoryId')}>
                <option value="">No Category</option>
                {categories.map(c => (
                  <option key={c._id} value={c._id}>{c.emoji} {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Price *</label>
              <input className="input" type="number" step="0.01" min="0" placeholder="0.00" required {...f('price')} />
            </div>
            <div>
              <label className="label">Sale / Offer Price</label>
              <input className="input" type="number" step="0.01" min="0" placeholder="Leave blank if no offer" {...f('discountedPrice')} />
            </div>
            <div>
              <label className="label">Stock (-1 = unlimited)</label>
              <input className="input" type="number" {...f('stock')} />
            </div>
            <div>
              <label className="label">Unit</label>
              <select className="input" {...f('unit')}>
                {niche.productUnits.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Description</label>
              <textarea className="input" rows={2} placeholder="Product description" {...f('description')} />
            </div>
            <div className="col-span-2">
              <label className="label">Image URL</label>
              <input className="input" type="url" placeholder="https://..." {...f('imageUrl')} />
            </div>
            <div className="col-span-2">
              <label className="label">PDF/Brochure URL (for menus, catalogs)</label>
              <input className="input" type="url" placeholder="https://..." {...f('pdfUrl')} />
            </div>
            <div className="col-span-2 flex flex-wrap gap-4">
              {[
                { field: 'isActive', label: 'Active' },
                { field: 'isFeatured', label: 'Featured' },
              ].map(({ field, label }) => (
                <label key={field} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form[field as keyof ProductForm] as boolean}
                    onChange={(e) => setForm(prev => ({ ...prev, [field]: e.target.checked }))}
                    className="accent-green-500"
                  />
                  <span className="text-xs text-gray-300">{label}</span>
                </label>
              ))}
              <p className="text-[10px] text-green-500/80 flex items-center gap-1">
                ⚡ WhatsApp message auto-sends to all customers on save
              </p>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => onClose(null)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
              {mutation.isPending ? 'Saving...' : product ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Products() {
  const { tenant } = useAuth()
  const niche = getNicheConfig(tenant?.businessType)
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editProduct, setEditProduct] = useState<Record<string, unknown> | null>(null)
  const [broadcastFlow, setBroadcastFlow] = useState<{ broadcast: PendingBroadcast; productName: string; isOffer: boolean } | null>(null)

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', search, catFilter],
    queryFn: () => productsApi.list({ search: search || undefined, category: catFilter || undefined, limit: 50 }).then(r => r.data),
  })

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => productsApi.getCategories().then(r => r.data.data),
  })

  const deleteMutation = useMutation({
    mutationFn: productsApi.delete,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); toast.success('Product deactivated') },
  })

  const products = productsData?.data || []
  const categories: { _id: string; name: string; emoji: string }[] = catData || []

  return (
    <div className="space-y-5">
      {/* Header actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className="input pl-9" placeholder="Search products..." value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-full sm:w-48" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c._id} value={c._id}>{c.emoji} {c.name}</option>)}
        </select>
        <button onClick={() => { setEditProduct(null); setShowModal(true) }} className="btn-primary shrink-0">
          <Plus size={16} /> {niche.newProductLabel}
        </button>
      </div>

      {/* Product grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-32 bg-gray-800 rounded-lg mb-3" />
              <div className="h-3 bg-gray-800 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="card text-center py-12">
          <Package size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No products yet</p>
          <p className="text-gray-600 text-xs mt-1">Click "Add Product" to create your first listing</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((p: {
            _id: string; name: string; description?: string; price: number;
            discountedPrice?: number; stock: number; isActive: boolean; isFeatured: boolean;
            imageUrl?: string; type: string; unit: string;
            categoryId?: { name: string; emoji: string }
          }) => (
            <div key={p._id} className={`card flex flex-col gap-2 hover:border-gray-700 transition-colors ${!p.isActive ? 'opacity-50' : ''}`}>
              {p.imageUrl ? (
                <img src={p.imageUrl} alt={p.name} className="w-full h-28 object-cover rounded-lg bg-gray-800" />
              ) : (
                <div className="w-full h-28 bg-gray-800 rounded-lg flex items-center justify-center">
                  <Package size={24} className="text-gray-600" />
                </div>
              )}
              <div className="flex-1">
                <div className="flex items-start justify-between gap-1">
                  <p className="text-sm font-semibold text-white leading-tight">{p.name}</p>
                  {p.isFeatured && <Star size={12} className="text-yellow-400 shrink-0 mt-0.5" fill="currentColor" />}
                </div>
                {p.categoryId && (
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {p.categoryId.emoji} {p.categoryId.name}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  {p.discountedPrice ? (
                    <>
                      <span className="text-sm font-bold text-green-400">{tenant?.currency} {p.discountedPrice.toFixed(2)}</span>
                      <span className="text-xs text-gray-600 line-through">{p.price.toFixed(2)}</span>
                    </>
                  ) : (
                    <span className="text-sm font-bold text-white">{tenant?.currency} {p.price.toFixed(2)}</span>
                  )}
                  <span className="text-[10px] text-gray-600">/ {p.unit}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[9px] ${p.stock === -1 ? 'badge-green' : p.stock > 0 ? 'badge-blue' : 'badge-red'}`}>
                    {p.stock === -1 ? 'Unlimited' : p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}
                  </span>
                  <span className="text-[9px] badge-gray">{p.type.replace('_', ' ')}</span>
                </div>
              </div>
              <div className="flex gap-2 pt-1 border-t border-gray-800">
                <button
                  onClick={() => { setEditProduct(p as unknown as Record<string, unknown>); setShowModal(true) }}
                  className="flex-1 text-xs text-gray-400 hover:text-white flex items-center justify-center gap-1.5 py-1 hover:bg-gray-800 rounded"
                >
                  <Pencil size={11} /> Edit
                </button>
                <button
                  onClick={() => deleteMutation.mutate(p._id)}
                  className="flex-1 text-xs text-gray-400 hover:text-red-400 flex items-center justify-center gap-1.5 py-1 hover:bg-red-500/10 rounded"
                >
                  <Trash2 size={11} /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ProductModal
          product={editProduct}
          categories={categories}
          businessType={tenant?.businessType}
          onClose={(pending, isOffer) => {
            setShowModal(false)
            const savedName = (editProduct?.name as string) || 'Product'
            setEditProduct(null)
            if (pending) {
              setBroadcastFlow({ broadcast: pending, productName: savedName, isOffer: !!isOffer })
            }
          }}
        />
      )}

      {broadcastFlow && (
        <BroadcastFlowModal
          broadcast={broadcastFlow.broadcast}
          productName={broadcastFlow.productName}
          isOffer={broadcastFlow.isOffer}
          onClose={() => setBroadcastFlow(null)}
        />
      )}
    </div>
  )
}
