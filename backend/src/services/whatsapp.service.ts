/**
 * WhatsApp Cloud API Service
 * Wraps all Meta Graph API calls for sending messages, templates, media
 */
import axios, { AxiosInstance } from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import { config } from '../config'
import { logger } from '../utils/logger'

export interface SendTextOptions {
  phoneNumberId: string
  accessToken: string
  to: string
  text: string
  previewUrl?: boolean
}

export interface SendTemplateOptions {
  phoneNumberId: string
  accessToken: string
  to: string
  templateName: string
  language: string
  components?: TemplateComponent[]
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button'
  sub_type?: string
  index?: string
  parameters: {
    type: 'text' | 'image' | 'video' | 'document' | 'payload'
    text?: string
    image?: { link: string }
    video?: { link: string }
    document?: { link: string; filename?: string }
    payload?: string
  }[]
}

export interface SendImageOptions {
  phoneNumberId: string
  accessToken: string
  to: string
  imageUrl: string
  caption?: string
}

export interface SendDocumentOptions {
  phoneNumberId: string
  accessToken: string
  to: string
  documentUrl: string
  caption?: string
  filename?: string
}

export interface SendLocationOptions {
  phoneNumberId: string
  accessToken: string
  to: string
  latitude: number
  longitude: number
  name?: string
  address?: string
}

export interface SendInteractiveListOptions {
  phoneNumberId: string
  accessToken: string
  to: string
  header?: string
  body: string
  footer?: string
  buttonText: string
  sections: {
    title: string
    rows: { id: string; title: string; description?: string }[]
  }[]
}

export interface SendInteractiveButtonsOptions {
  phoneNumberId: string
  accessToken: string
  to: string
  header?: string
  body: string
  footer?: string
  buttons: { id: string; title: string }[]
}

export type WhatsAppApiResult = {
  success: boolean
  messageId?: string
  error?: string
}

// Build per-tenant axios instance
function buildClient(accessToken: string): AxiosInstance {
  return axios.create({
    baseURL: `${config.meta.graphApiBaseUrl}/${config.meta.graphApiVersion}`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  })
}

// ─── Core Send Functions ──────────────────────────────────────────

export async function sendText(opts: SendTextOptions): Promise<WhatsAppApiResult> {
  try {
    const client = buildClient(opts.accessToken)
    const res = await client.post(`/${opts.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: opts.to,
      type: 'text',
      text: {
        body: opts.text,
        preview_url: opts.previewUrl ?? false,
      },
    })
    return { success: true, messageId: res.data?.messages?.[0]?.id }
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string }
    logger.error({ err: error?.response?.data || error?.message, to: opts.to }, 'sendText failed')
    return { success: false, error: JSON.stringify(error?.response?.data || error?.message) }
  }
}

export async function sendTemplate(opts: SendTemplateOptions): Promise<WhatsAppApiResult> {
  try {
    const client = buildClient(opts.accessToken)
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: opts.to,
      type: 'template',
      template: {
        name: opts.templateName,
        language: { code: opts.language },
      },
    }

    if (opts.components && opts.components.length > 0) {
      (payload.template as Record<string, unknown>).components = opts.components
    }

    const res = await client.post(`/${opts.phoneNumberId}/messages`, payload)
    return { success: true, messageId: res.data?.messages?.[0]?.id }
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string }
    logger.error({ err: error?.response?.data, template: opts.templateName }, 'sendTemplate failed')
    return { success: false, error: JSON.stringify(error?.response?.data || error?.message) }
  }
}

export async function sendImage(opts: SendImageOptions): Promise<WhatsAppApiResult> {
  try {
    const client = buildClient(opts.accessToken)
    const res = await client.post(`/${opts.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: opts.to,
      type: 'image',
      image: { link: opts.imageUrl, caption: opts.caption },
    })
    return { success: true, messageId: res.data?.messages?.[0]?.id }
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string }
    logger.error({ err: error?.response?.data }, 'sendImage failed')
    return { success: false, error: JSON.stringify(error?.response?.data) }
  }
}

export async function sendDocument(opts: SendDocumentOptions): Promise<WhatsAppApiResult> {
  try {
    const client = buildClient(opts.accessToken)
    const res = await client.post(`/${opts.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: opts.to,
      type: 'document',
      document: {
        link: opts.documentUrl,
        caption: opts.caption,
        filename: opts.filename || 'document.pdf',
      },
    })
    return { success: true, messageId: res.data?.messages?.[0]?.id }
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string }
    logger.error({ err: error?.response?.data }, 'sendDocument failed')
    return { success: false, error: JSON.stringify(error?.response?.data) }
  }
}

export async function sendLocation(opts: SendLocationOptions): Promise<WhatsAppApiResult> {
  try {
    const client = buildClient(opts.accessToken)
    const res = await client.post(`/${opts.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: opts.to,
      type: 'location',
      location: {
        latitude: opts.latitude,
        longitude: opts.longitude,
        name: opts.name,
        address: opts.address,
      },
    })
    return { success: true, messageId: res.data?.messages?.[0]?.id }
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string }
    logger.error({ err: error?.response?.data }, 'sendLocation failed')
    return { success: false, error: JSON.stringify(error?.response?.data) }
  }
}

export async function sendInteractiveList(opts: SendInteractiveListOptions): Promise<WhatsAppApiResult> {
  try {
    const client = buildClient(opts.accessToken)
    const res = await client.post(`/${opts.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: opts.to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: opts.header ? { type: 'text', text: opts.header } : undefined,
        body: { text: opts.body },
        footer: opts.footer ? { text: opts.footer } : undefined,
        action: {
          button: opts.buttonText,
          sections: opts.sections,
        },
      },
    })
    return { success: true, messageId: res.data?.messages?.[0]?.id }
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string }
    logger.error({ err: error?.response?.data }, 'sendInteractiveList failed')
    return { success: false, error: JSON.stringify(error?.response?.data) }
  }
}

export async function sendInteractiveButtons(opts: SendInteractiveButtonsOptions): Promise<WhatsAppApiResult> {
  try {
    const client = buildClient(opts.accessToken)
    const res = await client.post(`/${opts.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: opts.to,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: opts.header ? { type: 'text', text: opts.header } : undefined,
        body: { text: opts.body },
        footer: opts.footer ? { text: opts.footer } : undefined,
        action: {
          buttons: opts.buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    })
    return { success: true, messageId: res.data?.messages?.[0]?.id }
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string }
    logger.error({ err: error?.response?.data }, 'sendInteractiveButtons failed')
    return { success: false, error: JSON.stringify(error?.response?.data) }
  }
}

export async function markMessageRead(opts: {
  phoneNumberId: string
  accessToken: string
  messageId: string
}): Promise<void> {
  try {
    const client = buildClient(opts.accessToken)
    await client.post(`/${opts.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: opts.messageId,
    })
  } catch {
    // Non-critical, ignore
  }
}

export async function getPhoneNumberInfo(phoneNumberId: string, accessToken: string) {
  try {
    const client = buildClient(accessToken)
    const res = await client.get(`/${phoneNumberId}`, {
      params: { fields: 'display_phone_number,verified_name,quality_rating,code_verification_status' },
    })
    return res.data
  } catch {
    return null
  }
}

export async function uploadMedia(opts: {
  phoneNumberId: string
  accessToken: string
  filePath: string
  mimeType: string
}): Promise<string | null> {
  try {
    const form = new FormData()
    form.append('file', fs.createReadStream(opts.filePath), { contentType: opts.mimeType })
    form.append('messaging_product', 'whatsapp')
    form.append('type', opts.mimeType)

    const client = axios.create({
      baseURL: `${config.meta.graphApiBaseUrl}/${config.meta.graphApiVersion}`,
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        ...form.getHeaders(),
      },
    })

    const res = await client.post(`/${opts.phoneNumberId}/media`, form)
    return res.data?.id || null
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown } }
    logger.error({ err: error?.response?.data }, 'uploadMedia failed')
    return null
  }
}
