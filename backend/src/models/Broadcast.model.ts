/**
 * Broadcast / Campaign Model
 * Bulk messaging: festival campaigns, flash sales, product launches, reminders
 */
import mongoose, { Document, Schema, Types } from 'mongoose'

export type BroadcastStatus =
  | 'draft'
  | 'scheduled'
  | 'running'
  | 'completed'
  | 'paused'
  | 'cancelled'
  | 'failed'

export type BroadcastType =
  | 'marketing'
  | 'festival'
  | 'flash_sale'
  | 'new_product'
  | 'reminder'
  | 'feedback_request'
  | 'abandoned_cart'
  | 're_engagement'
  | 'announcement'
  | 'custom'

export interface IBroadcastRecipient {
  customerId: Types.ObjectId
  phone: string
  name?: string
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped'
  sentAt?: Date
  deliveredAt?: Date
  readAt?: Date
  failureReason?: string
  messageId?: string
}

export interface IBroadcast extends Document {
  tenantId: Types.ObjectId
  name: string
  type: BroadcastType
  status: BroadcastStatus

  // Message content
  messageType: 'text' | 'template' | 'image' | 'document'
  textContent?: string
  templateId?: Types.ObjectId
  templateName?: string
  templateVariables?: Record<string, string>
  mediaUrl?: string
  mediaCaption?: string

  // Audience segmentation
  audience: {
    type: 'all' | 'tags' | 'segment' | 'custom_list'
    tags?: string[]
    segment?: string
    customPhones?: string[]
    optInOnly: boolean
  }

  // Schedule
  scheduledAt?: Date
  timezone: string
  sendRate: number    // messages per second (avoid spam)

  // Stats
  stats: {
    totalRecipients: number
    sent: number
    delivered: number
    read: number
    failed: number
    skipped: number
    responseRate: number
    conversionCount: number
  }

  recipients: IBroadcastRecipient[]

  // Trigger-based (auto broadcast)
  isAutoTriggered: boolean
  triggerEvent?: string

  startedAt?: Date
  completedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const RecipientSchema = new Schema<IBroadcastRecipient>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    phone: { type: String, required: true },
    name: { type: String },
    status: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'read', 'failed', 'skipped'],
      default: 'pending',
    },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    readAt: { type: Date },
    failureReason: { type: String },
    messageId: { type: String },
  },
  { _id: false }
)

const BroadcastSchema = new Schema<IBroadcast>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['marketing', 'festival', 'flash_sale', 'new_product', 'reminder',
             'feedback_request', 'abandoned_cart', 're_engagement', 'announcement', 'custom'],
      default: 'custom',
    },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'running', 'completed', 'paused', 'cancelled', 'failed'],
      default: 'draft',
    },
    messageType: {
      type: String,
      enum: ['text', 'template', 'image', 'document'],
      default: 'text',
    },
    textContent: { type: String },
    templateId: { type: Schema.Types.ObjectId, ref: 'Template' },
    templateName: { type: String },
    templateVariables: { type: Schema.Types.Mixed },
    mediaUrl: { type: String },
    mediaCaption: { type: String },

    audience: {
      type: { type: String, enum: ['all', 'tags', 'segment', 'custom_list'], default: 'all' },
      tags: [{ type: String }],
      segment: { type: String },
      customPhones: [{ type: String }],
      optInOnly: { type: Boolean, default: true },
    },

    scheduledAt: { type: Date },
    timezone: { type: String, default: 'UTC' },
    sendRate: { type: Number, default: 1 },

    stats: {
      totalRecipients: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      read: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      responseRate: { type: Number, default: 0 },
      conversionCount: { type: Number, default: 0 },
    },

    recipients: [RecipientSchema],

    isAutoTriggered: { type: Boolean, default: false },
    triggerEvent: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
)

BroadcastSchema.index({ tenantId: 1, status: 1 })
BroadcastSchema.index({ tenantId: 1, scheduledAt: 1 })
BroadcastSchema.index({ tenantId: 1, type: 1 })

export const Broadcast = mongoose.model<IBroadcast>('Broadcast', BroadcastSchema)
