/**
 * Product / Service / Listing Model
 * Works for: products, menu items, hotel rooms, property listings, services, etc.
 */
import mongoose, { Document, Schema, Types } from 'mongoose'

export type ProductType =
  | 'product'        // Physical product
  | 'service'        // Service offering
  | 'menu_item'      // Restaurant menu
  | 'room'           // Hotel room
  | 'property'       // Real estate
  | 'package'        // Travel/marketing package
  | 'appointment'    // Clinic/salon slot type

export interface IProduct extends Document {
  tenantId: Types.ObjectId
  categoryId?: Types.ObjectId
  type: ProductType
  name: string
  description?: string
  price: number
  discountedPrice?: number
  currency: string
  sku?: string
  stock: number        // -1 = unlimited
  imageUrl?: string
  imageUrls?: string[]
  pdfUrl?: string      // Menu, brochure, catalog
  unit?: string        // 'kg', 'piece', 'night', 'hour', etc.
  tags: string[]
  isActive: boolean
  isFeatured: boolean
  sortOrder: number

  // Business-specific fields
  attributes: Record<string, unknown>
  // e.g. hotel: { bedType, maxOccupancy, amenities[] }
  // e.g. real_estate: { bedrooms, bathrooms, sqft, furnishing }
  // e.g. restaurant: { isVeg, spiceLevel, allergens[], prepTime }

  // Triggers
  notifyOnAdd: boolean   // Broadcast to subscribers when added
  createdAt: Date
  updatedAt: Date
}

const ProductSchema = new Schema<IProduct>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
    type: {
      type: String,
      enum: ['product', 'service', 'menu_item', 'room', 'property', 'package', 'appointment'],
      default: 'product',
    },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    price: { type: Number, required: true, min: 0 },
    discountedPrice: { type: Number, min: 0 },
    currency: { type: String, default: 'USD' },
    sku: { type: String, trim: true },
    stock: { type: Number, default: -1 },
    imageUrl: { type: String },
    imageUrls: [{ type: String }],
    pdfUrl: { type: String },
    unit: { type: String, default: 'piece' },
    tags: [{ type: String }],
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    attributes: { type: Schema.Types.Mixed, default: {} },
    notifyOnAdd: { type: Boolean, default: false },
  },
  { timestamps: true }
)

ProductSchema.index({ tenantId: 1, isActive: 1 })
ProductSchema.index({ tenantId: 1, categoryId: 1 })
ProductSchema.index({ tenantId: 1, isFeatured: 1 })
ProductSchema.index({ tenantId: 1, name: 'text', description: 'text' }) // text search

export const Product = mongoose.model<IProduct>('Product', ProductSchema)

// Category Model
export interface ICategory extends Document {
  tenantId: Types.ObjectId
  name: string
  description?: string
  emoji: string
  imageUrl?: string
  sortOrder: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const CategorySchema = new Schema<ICategory>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    emoji: { type: String, default: '📦' },
    imageUrl: { type: String },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

export const Category = mongoose.model<ICategory>('Category', CategorySchema)
