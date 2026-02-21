import mongoose, { Document, Schema, Types } from 'mongoose'

export interface ICartItem extends Document {
  tenantId: Types.ObjectId
  customerId: Types.ObjectId
  productId: Types.ObjectId
  productName: string
  price: number
  quantity: number
  addedAt: Date
}

const CartItemSchema = new Schema<ICartItem>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    addedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
)

CartItemSchema.index({ tenantId: 1, customerId: 1 })
CartItemSchema.index(
  { tenantId: 1, customerId: 1, productId: 1 },
  { unique: true }
)

export const CartItem = mongoose.model<ICartItem>('CartItem', CartItemSchema)
