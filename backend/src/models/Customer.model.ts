/**
 * Customer Model — Contacts who interact via WhatsApp
 * Scoped per tenant with full CRM capabilities
 */
import mongoose, { Document, Schema, Types } from 'mongoose'

export type CustomerTag =
  | 'new'
  | 'vip'
  | 'repeat_buyer'
  | 'lead'
  | 'hot_lead'
  | 'cold_lead'
  | 'churned'
  | 'opted_out'
  | 'hotel_guest'
  | 'restaurant_diner'
  | 'grocery_buyer'
  | 'property_lead'
  | 'clinic_patient'
  | 'salon_client'
  | 'ecommerce_shopper'

export interface ICustomer extends Document {
  tenantId: Types.ObjectId
  phone: string              // WhatsApp JID (e.g., 919876543210)
  name?: string
  email?: string
  language: string
  profilePictureUrl?: string

  // CRM
  tags: CustomerTag[]
  notes?: string
  leadScore: number
  segment?: string
  assignedAgentId?: Types.ObjectId

  // Opt-in/Opt-out (GDPR compliance)
  optIn: boolean
  optInAt?: Date
  optOutAt?: Date
  isBlocked: boolean
  blacklistedReason?: string

  // Engagement
  totalMessages: number
  totalOrders: number
  totalSpent: number
  lastMessageAt?: Date
  lastOrderAt?: Date
  firstSeenAt: Date

  // Conversation state
  conversationState: string
  conversationContext: Record<string, unknown>

  // Custom fields (business-specific)
  customFields: Record<string, unknown>

  tenantId_phone: string // compound index key
  createdAt: Date
  updatedAt: Date
}

const CustomerSchema = new Schema<ICustomer>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    phone: { type: String, required: true, trim: true },
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    language: { type: String, default: 'en' },
    profilePictureUrl: { type: String },

    tags: {
      type: [String],
      default: ['new'],
      enum: [
        'new', 'vip', 'repeat_buyer', 'lead', 'hot_lead', 'cold_lead',
        'churned', 'opted_out', 'hotel_guest', 'restaurant_diner',
        'grocery_buyer', 'property_lead', 'clinic_patient', 'salon_client',
        'ecommerce_shopper',
      ],
    },
    notes: { type: String },
    leadScore: { type: Number, default: 0 },
    segment: { type: String },
    assignedAgentId: { type: Schema.Types.ObjectId },

    optIn: { type: Boolean, default: true },
    optInAt: { type: Date },
    optOutAt: { type: Date },
    isBlocked: { type: Boolean, default: false },
    blacklistedReason: { type: String },

    totalMessages: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    lastMessageAt: { type: Date },
    lastOrderAt: { type: Date },
    firstSeenAt: { type: Date, default: Date.now },

    conversationState: { type: String, default: 'MENU' },
    conversationContext: { type: Schema.Types.Mixed, default: {} },
    customFields: { type: Schema.Types.Mixed, default: {} },

    tenantId_phone: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
)

// Pre-save: create compound unique key
CustomerSchema.pre('save', function (next) {
  this.tenantId_phone = `${this.tenantId}_${this.phone}`
  next()
})

// Auto-tag based on lead score
CustomerSchema.methods.autoTag = function () {
  if (this.totalOrders >= 5) {
    if (!this.tags.includes('vip')) this.tags.push('vip')
    if (!this.tags.includes('repeat_buyer')) this.tags.push('repeat_buyer')
  } else if (this.totalOrders >= 1) {
    if (!this.tags.includes('repeat_buyer')) this.tags.push('repeat_buyer')
  }
  if (this.leadScore > 50) {
    if (!this.tags.includes('hot_lead')) this.tags.push('hot_lead')
  }
}

CustomerSchema.index({ tenantId: 1, phone: 1 }, { unique: true })
CustomerSchema.index({ tenantId: 1, tags: 1 })
CustomerSchema.index({ tenantId: 1, leadScore: -1 })
CustomerSchema.index({ tenantId: 1, optIn: 1 })
CustomerSchema.index({ tenantId: 1, lastMessageAt: -1 })

export const Customer = mongoose.model<ICustomer>('Customer', CustomerSchema)
