/**
 * Message Model — Full conversation history
 * Used for: AI context, analytics, compliance audit trail
 */
import mongoose, { Document, Schema, Types } from 'mongoose'

export type MessageRole = 'user' | 'assistant' | 'system'
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed'
export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'location'
  | 'template'
  | 'interactive'
  | 'reaction'

export interface IMessage extends Document {
  tenantId: Types.ObjectId
  customerId: Types.ObjectId
  whatsappMessageId?: string   // Meta-assigned message ID
  role: MessageRole
  type: MessageType
  content: string
  mediaUrl?: string
  mediaCaption?: string
  templateName?: string
  status: MessageStatus
  isAiGenerated: boolean
  isFromBroadcast: boolean
  broadcastId?: Types.ObjectId
  campaignId?: Types.ObjectId
  tokenCount?: number
  processingMs?: number
  createdAt: Date
  updatedAt: Date
}

const MessageSchema = new Schema<IMessage>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    whatsappMessageId: { type: String, sparse: true },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'document', 'location', 'template', 'interactive', 'reaction'],
      default: 'text',
    },
    content: { type: String, required: true },
    mediaUrl: { type: String },
    mediaCaption: { type: String },
    templateName: { type: String },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read', 'failed'],
      default: 'sent',
    },
    isAiGenerated: { type: Boolean, default: false },
    isFromBroadcast: { type: Boolean, default: false },
    broadcastId: { type: Schema.Types.ObjectId, ref: 'Broadcast' },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign' },
    tokenCount: { type: Number },
    processingMs: { type: Number },
  },
  { timestamps: true }
)

MessageSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 })
MessageSchema.index({ tenantId: 1, createdAt: -1 })
MessageSchema.index({ whatsappMessageId: 1 }, { sparse: true })
MessageSchema.index({ tenantId: 1, status: 1 })

export const Message = mongoose.model<IMessage>('Message', MessageSchema)
