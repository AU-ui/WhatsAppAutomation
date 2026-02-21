/**
 * Tenant Model — Each business registered on the platform
 * Multi-tenant: all resources are scoped to a tenant._id
 */
import mongoose, { Document, Schema } from 'mongoose'
import bcrypt from 'bcryptjs'
import { BUSINESS_TYPES, type BusinessType } from '../config'

export interface ITenant extends Document {
  // Business identity
  businessName: string
  businessType: BusinessType
  email: string
  password: string
  phone?: string
  website?: string
  address?: string
  timezone: string
  currency: string
  logoUrl?: string

  // WhatsApp Cloud API credentials (per tenant)
  whatsapp: {
    phoneNumberId: string       // From Meta Developer Portal
    businessAccountId: string   // WABA ID
    accessToken: string         // Permanent token
    webhookVerifyToken: string  // Custom per-tenant verify token
    displayName?: string
    isVerified: boolean
  }

  // Subscription
  subscription: {
    plan: 'trial' | 'basic' | 'pro' | 'enterprise'
    status: 'active' | 'past_due' | 'canceled' | 'trialing'
    stripeCustomerId?: string
    stripeSubscriptionId?: string
    currentPeriodEnd?: Date
    trialEndsAt?: Date
    messagesUsedThisMonth: number
    messagesResetAt: Date
  }

  // Business settings
  settings: {
    welcomeMessage?: string
    awayMessage?: string
    businessHours?: {
      enabled: boolean
      timezone: string
      schedule: {
        day: string
        open: string   // "09:00"
        close: string  // "18:00"
        closed: boolean
      }[]
    }
    aiEnabled: boolean
    aiPersonality?: string
    brandTone: 'professional' | 'friendly' | 'casual' | 'formal'
    autoReplyEnabled: boolean
    humanHandoffEnabled: boolean
    handoffKeywords: string[]
  }

  // Team members
  teamMembers: {
    email: string
    name: string
    role: 'admin' | 'agent' | 'viewer'
    phone?: string
    isActive: boolean
  }[]

  role: 'superadmin' | 'tenant'
  isActive: boolean
  lastLoginAt?: Date
  createdAt: Date
  updatedAt: Date

  comparePassword(candidatePassword: string): Promise<boolean>
}

const TenantSchema = new Schema<ITenant>(
  {
    businessName: { type: String, required: true, trim: true },
    businessType: {
      type: String,
      enum: BUSINESS_TYPES,
      default: 'general',
    },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    phone: { type: String, trim: true },
    website: { type: String, trim: true },
    address: { type: String },
    timezone: { type: String, default: 'UTC' },
    currency: { type: String, default: 'USD' },
    logoUrl: { type: String },

    whatsapp: {
      phoneNumberId: { type: String, default: '' },
      businessAccountId: { type: String, default: '' },
      accessToken: { type: String, default: '', select: false },
      webhookVerifyToken: { type: String, default: '' },
      displayName: { type: String },
      isVerified: { type: Boolean, default: false },
    },

    subscription: {
      plan: {
        type: String,
        enum: ['trial', 'basic', 'pro', 'enterprise'],
        default: 'trial',
      },
      status: {
        type: String,
        enum: ['active', 'past_due', 'canceled', 'trialing'],
        default: 'trialing',
      },
      stripeCustomerId: { type: String },
      stripeSubscriptionId: { type: String },
      currentPeriodEnd: { type: Date },
      trialEndsAt: {
        type: Date,
        default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day trial
      },
      messagesUsedThisMonth: { type: Number, default: 0 },
      messagesResetAt: {
        type: Date,
        default: () => {
          const d = new Date()
          d.setMonth(d.getMonth() + 1, 1)
          d.setHours(0, 0, 0, 0)
          return d
        },
      },
    },

    settings: {
      welcomeMessage: {
        type: String,
        default: '👋 Welcome to {BUSINESS_NAME}! How can I help you today?',
      },
      awayMessage: {
        type: String,
        default: 'We are currently away. Our business hours are {BUSINESS_HOURS}. We\'ll get back to you soon!',
      },
      businessHours: {
        enabled: { type: Boolean, default: false },
        timezone: { type: String, default: 'UTC' },
        schedule: [
          {
            day: { type: String },
            open: { type: String },
            close: { type: String },
            closed: { type: Boolean, default: false },
          },
        ],
      },
      aiEnabled: { type: Boolean, default: true },
      aiPersonality: { type: String },
      brandTone: {
        type: String,
        enum: ['professional', 'friendly', 'casual', 'formal'],
        default: 'friendly',
      },
      autoReplyEnabled: { type: Boolean, default: true },
      humanHandoffEnabled: { type: Boolean, default: true },
      handoffKeywords: {
        type: [String],
        default: ['human', 'agent', 'person', 'manager', 'representative'],
      },
    },

    teamMembers: [
      {
        email: { type: String, required: true },
        name: { type: String, required: true },
        role: { type: String, enum: ['admin', 'agent', 'viewer'], default: 'agent' },
        phone: { type: String },
        isActive: { type: Boolean, default: true },
      },
    ],

    role: { type: String, enum: ['superadmin', 'tenant'], default: 'tenant' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
)

// Hash password before saving
TenantSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 12)
  next()
})

TenantSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password)
}

// Indexes
TenantSchema.index({ email: 1 })
TenantSchema.index({ 'whatsapp.phoneNumberId': 1 })
TenantSchema.index({ 'subscription.status': 1 })

export const Tenant = mongoose.model<ITenant>('Tenant', TenantSchema)
