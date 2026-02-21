import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  WASocket,
  proto,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import path from 'path'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const qrcode = require('qrcode-terminal') as { generate: (qr: string, opts: { small: boolean }) => void }
import { config } from '../config'
import { handleMessage } from './messageHandler'
import { restoreActiveHandoffs } from '../features/handoff/agentManager'
import { logger } from '../utils/logger'
import { notifyQR, notifyConnected, notifyDisconnected } from '../dashboard/whatsappState'

let sock: WASocket | null = null
let reconnectTimer: NodeJS.Timeout | null = null

/** Create and connect a Baileys WhatsApp socket */
export async function connectWhatsApp(): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState(
    path.resolve(config.whatsapp.authDir)
  )

  const { version } = await fetchLatestBaileysVersion()
  logger.info({ version }, 'Using WhatsApp Web version')

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: require('pino')({ level: 'silent' }), // Suppress Baileys internal logs
    browser: [`${config.business.name} Bot`, 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  })

  // Save credentials whenever updated
  sock.ev.on('creds.update', saveCreds)

  // Handle connection state changes
  sock.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log('\n\n========== SCAN THIS QR CODE WITH WHATSAPP ==========')
      qrcode.generate(qr, { small: true })
      console.log('=====================================================\n')
      console.log('Or open http://localhost:3000 in your browser to scan\n')
      notifyQR(qr)
    }

    if (connection === 'open') {
      logger.info('✅ WhatsApp connected successfully!')
      notifyConnected()
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      // Restore any active handoff sessions from DB
      restoreActiveHandoffs()
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const reason = (DisconnectReason as Record<number, string>)[statusCode ?? 0] ?? 'Unknown'

      logger.warn({ statusCode, reason }, 'WhatsApp disconnected')
      notifyDisconnected()

      if (statusCode === DisconnectReason.loggedOut) {
        logger.error('Logged out from WhatsApp. Delete auth_info_baileys folder and restart.')
        process.exit(1)
      } else {
        // Auto-reconnect with exponential backoff
        const delay = Math.min(5000 * (1 + Math.random()), 30000)
        logger.info({ delay }, 'Reconnecting...')
        reconnectTimer = setTimeout(() => connectWhatsApp(), delay)
      }
    }
  })

  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const message of messages) {
      const jid = message.key.remoteJid || ''
      // Skip: no content, own messages, newsletters, status broadcasts, groups
      if (!message.message || message.key.fromMe) continue
      if (jid.endsWith('@newsletter') || jid === 'status@broadcast') continue
      if (jid.endsWith('@g.us')) continue   // skip group messages

      try {
        await handleMessage(sock!, message)
      } catch (err) {
        logger.error({ err, msgId: message.key.id }, 'Error handling message')
      }
    }
  })

  // Handle message receipts (read receipts)
  sock.ev.on('message-receipt.update', updates => {
    for (const update of updates) {
      if (update.receipt?.readTimestamp) {
        logger.debug({ id: update.key.id }, 'Message read')
      }
    }
  })

  return sock
}

/** Get the currently connected socket */
export function getSocket(): WASocket | null {
  return sock
}
