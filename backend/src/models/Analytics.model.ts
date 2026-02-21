/**
 * Analytics Model — Daily aggregated metrics per tenant
 */
import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IAnalytics extends Document {
  tenantId: Types.ObjectId
  date: Date              // Start of day (UTC midnight)

  messages: {
    incoming: number
    outgoing: number
    aiGenerated: number
    broadcast: number
    failed: number
  }

  conversations: {
    new: number
    active: number
    resolved: number
    handoffs: number
  }

  customers: {
    new: number
    returning: number
    optOuts: number
  }

  orders: {
    created: number
    confirmed: number
    completed: number
    cancelled: number
    revenue: number
  }

  flows: {
    triggered: number
    completed: number
    byFlow: Record<string, number>  // flowId -> count
  }

  // Per-hour breakdown (0-23)
  hourlyMessages: number[]

  createdAt: Date
  updatedAt: Date
}

const AnalyticsSchema = new Schema<IAnalytics>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    date: { type: Date, required: true },

    messages: {
      incoming: { type: Number, default: 0 },
      outgoing: { type: Number, default: 0 },
      aiGenerated: { type: Number, default: 0 },
      broadcast: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },

    conversations: {
      new: { type: Number, default: 0 },
      active: { type: Number, default: 0 },
      resolved: { type: Number, default: 0 },
      handoffs: { type: Number, default: 0 },
    },

    customers: {
      new: { type: Number, default: 0 },
      returning: { type: Number, default: 0 },
      optOuts: { type: Number, default: 0 },
    },

    orders: {
      created: { type: Number, default: 0 },
      confirmed: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      cancelled: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
    },

    flows: {
      triggered: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      byFlow: { type: Schema.Types.Mixed, default: {} },
    },

    hourlyMessages: {
      type: [Number],
      default: () => new Array(24).fill(0),
    },
  },
  { timestamps: true }
)

AnalyticsSchema.index({ tenantId: 1, date: -1 }, { unique: true })

export const Analytics = mongoose.model<IAnalytics>('Analytics', AnalyticsSchema)
