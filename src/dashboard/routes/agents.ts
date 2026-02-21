import { Router, Request, Response } from 'express'
import {
  listAgents,
  getAgentById,
  createAgent,
  updateAgent,
  deleteAgent,
  listHandoffs,
} from '../../features/handoff/agentManager'

const router = Router()

// GET /api/agents
router.get('/', (_req: Request, res: Response) => {
  res.json({ success: true, data: listAgents() })
})

// GET /api/agents/:id
router.get('/:id', (req: Request, res: Response) => {
  const agent = getAgentById(parseInt(req.params.id))
  if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' })
  res.json({ success: true, data: agent })
})

// POST /api/agents — register a new human agent
router.post('/', (req: Request, res: Response) => {
  const { name, phone } = req.body
  if (!name || !phone) {
    return res.status(400).json({ success: false, message: 'name and phone are required' })
  }

  // Normalise phone: strip spaces, dashes, leading +
  const normPhone = phone.replace(/[\s\-]/g, '').replace(/^\+/, '')
  const jid = normPhone.includes('@') ? normPhone : `${normPhone}@s.whatsapp.net`

  try {
    const agent = createAgent(name, jid)
    res.status(201).json({ success: true, data: agent })
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ success: false, message: 'An agent with this phone already exists' })
    }
    throw err
  }
})

// PATCH /api/agents/:id
router.patch('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const agent = getAgentById(id)
  if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' })

  const { name, active } = req.body
  const updates: Record<string, unknown> = {}
  if (name) updates.name = name
  if (typeof active === 'boolean') updates.active = active ? 1 : 0

  updateAgent(id, updates)
  res.json({ success: true, data: getAgentById(id) })
})

// DELETE /api/agents/:id
router.delete('/:id', (req: Request, res: Response) => {
  const agent = getAgentById(parseInt(req.params.id))
  if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' })
  deleteAgent(parseInt(req.params.id))
  res.json({ success: true, message: 'Agent deleted' })
})

// GET /api/agents/handoffs — list handoff sessions
router.get('/handoffs/list', (req: Request, res: Response) => {
  const status = req.query.status as string | undefined
  res.json({ success: true, data: listHandoffs(status) })
})

export default router
