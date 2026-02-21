/**
 * Message Template Model
 * Covers: WhatsApp approved templates + custom quick-reply templates
 */
import mongoose, { Document, Schema, Types } from 'mongoose'

export type TemplateCategory =
  | 'MARKETING'
  | 'UTILITY'
  | 'AUTHENTICATION'

export type TemplateStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'disabled'

export interface ITemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS'
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  text?: string
  example?: { header_text?: string[]; body_text?: string[][] }
  buttons?: {
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'
    text: string
    url?: string
    phone_number?: string
  }[]
}

export interface ITemplate extends Document {
  tenantId: Types.ObjectId
  name: string              // Template identifier (snake_case, no spaces)
  displayName: string       // Human-readable name
  description?: string
  category: TemplateCategory
  language: string
  components: ITemplateComponent[]
  metaTemplateId?: string   // ID from Meta after approval
  status: TemplateStatus
  rejectionReason?: string

  // Usage tracking
  useCount: number
  lastUsedAt?: Date

  // Pre-built template flag
  isPrebuilt: boolean
  prebuiltType?: string     // 'welcome', 'festival', 'booking_confirmation', etc.

  // Variable placeholders: {{1}}, {{2}}, etc.
  variables: { name: string; description: string; example: string }[]

  createdAt: Date
  updatedAt: Date
}

const TemplateSchema = new Schema<ITemplate>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, lowercase: true },
    displayName: { type: String, required: true, trim: true },
    description: { type: String },
    category: {
      type: String,
      enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
      required: true,
    },
    language: { type: String, default: 'en_US' },
    components: [
      {
        type: { type: String, enum: ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'] },
        format: { type: String },
        text: { type: String },
        example: { type: Schema.Types.Mixed },
        buttons: [
          {
            type: { type: String },
            text: { type: String },
            url: { type: String },
            phone_number: { type: String },
          },
        ],
        _id: false,
      },
    ],
    metaTemplateId: { type: String },
    status: {
      type: String,
      enum: ['draft', 'pending_approval', 'approved', 'rejected', 'disabled'],
      default: 'draft',
    },
    rejectionReason: { type: String },
    useCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date },
    isPrebuilt: { type: Boolean, default: false },
    prebuiltType: { type: String },
    variables: [
      {
        name: { type: String },
        description: { type: String },
        example: { type: String },
        _id: false,
      },
    ],
  },
  { timestamps: true }
)

TemplateSchema.index({ tenantId: 1, name: 1 }, { unique: true })
TemplateSchema.index({ tenantId: 1, status: 1 })
TemplateSchema.index({ tenantId: 1, category: 1 })

export const Template = mongoose.model<ITemplate>('Template', TemplateSchema)
