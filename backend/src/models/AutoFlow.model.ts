/**
 * AutoFlow Model — Keyword-triggered conversation flows
 * Supports business-type-specific flows (hotel, restaurant, grocery, etc.)
 */
import mongoose, { Document, Schema, Types } from 'mongoose'
import { type BusinessType } from '../config'

export type FlowActionType =
  | 'send_text'
  | 'send_image'
  | 'send_document'
  | 'send_location'
  | 'send_catalog'
  | 'send_template'
  | 'collect_input'
  | 'create_order'
  | 'create_booking'
  | 'tag_customer'
  | 'assign_agent'
  | 'trigger_broadcast'
  | 'webhook_call'
  | 'set_state'
  | 'conditional'

export interface IFlowAction {
  id: string
  type: FlowActionType
  label?: string
  config: Record<string, unknown>
  // e.g. for send_text: { text: "Here is our menu..." }
  // e.g. for collect_input: { field: "checkInDate", prompt: "What date?" }
  // e.g. for conditional: { field: "{{input}}", operator: "equals", value: "yes", nextActionId: "a2", elseActionId: "a3" }
  nextActionId?: string
}

export interface IAutoFlow extends Document {
  tenantId: Types.ObjectId
  name: string
  description?: string
  businessType?: BusinessType   // Optional: restrict to specific business type
  isActive: boolean
  isDefault: boolean            // True = applies to all tenants of this type (platform defaults)

  // Triggers
  triggers: {
    keywords: string[]          // ["menu", "price", "book"]
    exactMatch: boolean         // False = partial match
    caseSensitive: boolean
    language?: string
  }[]

  // Flow actions chain
  actions: IFlowAction[]

  // Statistics
  triggerCount: number
  lastTriggeredAt?: Date

  // Category (for dashboard grouping)
  category: 'product' | 'booking' | 'support' | 'marketing' | 'onboarding' | 'custom'

  createdAt: Date
  updatedAt: Date
}

const FlowActionSchema = new Schema<IFlowAction>(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    label: { type: String },
    config: { type: Schema.Types.Mixed, default: {} },
    nextActionId: { type: String },
  },
  { _id: false }
)

const AutoFlowSchema = new Schema<IAutoFlow>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    businessType: { type: String },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },

    triggers: [
      {
        keywords: [{ type: String }],
        exactMatch: { type: Boolean, default: false },
        caseSensitive: { type: Boolean, default: false },
        language: { type: String },
        _id: false,
      },
    ],

    actions: [FlowActionSchema],

    triggerCount: { type: Number, default: 0 },
    lastTriggeredAt: { type: Date },

    category: {
      type: String,
      enum: ['product', 'booking', 'support', 'marketing', 'onboarding', 'custom'],
      default: 'custom',
    },
  },
  { timestamps: true }
)

AutoFlowSchema.index({ tenantId: 1, isActive: 1 })
AutoFlowSchema.index({ tenantId: 1, 'triggers.keywords': 1 })
AutoFlowSchema.index({ tenantId: 1, category: 1 })

export const AutoFlow = mongoose.model<IAutoFlow>('AutoFlow', AutoFlowSchema)
