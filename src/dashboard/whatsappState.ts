/**
 * Shared WhatsApp connection state
 * Updated by the Baileys client; read by the dashboard SSE endpoint
 */

export type WAStatusType = 'connecting' | 'qr_ready' | 'connected' | 'disconnected'

export interface WAState {
  status: WAStatusType
  qrString: string | null
  connectedAt: string | null
}

export const waState: WAState = {
  status: 'connecting',
  qrString: null,
  connectedAt: null,
}

// ─── SSE client registry ──────────────────────────────
type SendFn = (chunk: string) => void
const sseClients = new Set<SendFn>()

export function registerSSEClient(send: SendFn): () => void {
  sseClients.add(send)
  return () => sseClients.delete(send)
}

function broadcast(event: string, data: unknown): void {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const send of [...sseClients]) {
    try { send(msg) } catch { sseClients.delete(send) }
  }
}

// ─── State setters (called by client.ts) ─────────────
export function notifyQR(qr: string): void {
  waState.status = 'qr_ready'
  waState.qrString = qr
  waState.connectedAt = null
  broadcast('qr', { qr })
}

export function notifyConnected(): void {
  waState.status = 'connected'
  waState.qrString = null
  waState.connectedAt = new Date().toISOString()
  broadcast('connected', { connectedAt: waState.connectedAt })
}

export function notifyDisconnected(): void {
  waState.status = 'disconnected'
  waState.qrString = null
  waState.connectedAt = null
  broadcast('disconnected', {})
}
