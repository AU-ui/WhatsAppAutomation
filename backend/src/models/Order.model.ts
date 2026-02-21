/**
 * Order / Booking / Appointment Model
 * Universal: works for product orders, table bookings, room reservations,
 * property site visits, clinic appointments, salon bookings, etc.
 */
import mongoose, { Document, Schema, Types } from 'mongoose'

export type OrderType =
  | 'product_order'
  | 'table_booking'
  | 'room_reservation'
  | 'site_visit'
  | 'appointment'
  | 'service_booking'

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'refunded'

export interface IOrderItem {
  productId: Types.ObjectId
  productName: string
  sku?: string
  quantity: number
  price: number
  discountedPrice?: number
  subtotal: number
}

export interface IOrder extends Document {
  tenantId: Types.ObjectId
  customerId: Types.ObjectId
  orderNumber: string
  type: OrderType
  status: OrderStatus
  items: IOrderItem[]
  subtotal: number
  discount: number
  tax: number
  total: number
  currency: string
  notes?: string
  deliveryAddress?: string

  // Booking-specific
  scheduledAt?: Date
  scheduledEndAt?: Date
  guestCount?: number

  // Payment
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded'
  paymentMethod?: string
  paymentReference?: string

  // Communication
  confirmationSentAt?: Date
  reminderSentAt?: Date
  feedbackSentAt?: Date
  feedbackRating?: number
  feedbackComment?: string

  createdAt: Date
  updatedAt: Date
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    sku: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
    discountedPrice: { type: Number },
    subtotal: { type: Number, required: true },
  },
  { _id: false }
)

const OrderSchema = new Schema<IOrder>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    orderNumber: { type: String, unique: true },
    type: {
      type: String,
      enum: ['product_order', 'table_booking', 'room_reservation', 'site_visit', 'appointment', 'service_booking'],
      default: 'product_order',
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'ready', 'completed', 'cancelled', 'refunded'],
      default: 'pending',
    },
    items: [OrderItemSchema],
    subtotal: { type: Number, required: true, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    notes: { type: String },
    deliveryAddress: { type: String },
    scheduledAt: { type: Date },
    scheduledEndAt: { type: Date },
    guestCount: { type: Number },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    paymentMethod: { type: String },
    paymentReference: { type: String },
    confirmationSentAt: { type: Date },
    reminderSentAt: { type: Date },
    feedbackSentAt: { type: Date },
    feedbackRating: { type: Number, min: 1, max: 5 },
    feedbackComment: { type: String },
  },
  { timestamps: true }
)

// Auto-generate order number
OrderSchema.pre('save', function (next) {
  if (!this.orderNumber) {
    const ts = Date.now().toString(36).toUpperCase()
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase()
    this.orderNumber = `ORD-${ts}-${rand}`
  }
  next()
})

OrderSchema.index({ tenantId: 1, customerId: 1 })
OrderSchema.index({ tenantId: 1, status: 1 })
OrderSchema.index({ tenantId: 1, createdAt: -1 })
OrderSchema.index({ tenantId: 1, scheduledAt: 1 })
OrderSchema.index({ orderNumber: 1 }, { unique: true })

export const Order = mongoose.model<IOrder>('Order', OrderSchema)
