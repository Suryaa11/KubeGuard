const express = require('express')
const Event = require('../models/Event')
const { requireRole } = require('../middleware/checkRole')
const { ForbiddenError, NotFoundError } = require('../utils/errors')

const router = express.Router()

router.use(requireRole('Admin', 'DevOpsEngineer'))

function buildAccessQuery(req) {
  if (req.user.isAdmin) {
    return {}
  }

  return { projectOwnerId: req.user.id }
}

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1)
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100)
    const query = buildAccessQuery(req)

    if (req.query.projectId) query.projectId = req.query.projectId
    if (req.query.status) query.status = req.query.status

    const skip = (page - 1) * limit
    const [events, total] = await Promise.all([
      Event.find(query).sort({ detectedAt: -1 }).skip(skip).limit(limit).lean(),
      Event.countDocuments(query),
    ])

    res.json({
      events,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id).lean()
    if (!event) {
      throw new NotFoundError('Event not found')
    }

    if (!req.user.isAdmin && event.projectOwnerId !== req.user.id) {
      throw new ForbiddenError('You do not have access to this event')
    }

    res.json({ event })
  } catch (error) {
    next(error)
  }
})

module.exports = router
