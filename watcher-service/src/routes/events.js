const express = require('express')
const Event = require('../models/Event')

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const { projectId, status, page = 1, limit = 20 } = req.query
    const query = {}
    if (projectId) query.projectId = projectId
    if (status) query.status = status

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10)
    const [events, total] = await Promise.all([
      Event.find(query).sort({ detectedAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      Event.countDocuments(query),
    ])

    res.json({ events, total, page: parseInt(page, 10), limit: parseInt(limit, 10) })
  } catch (error) {
    res.status(500).json({ error: 'InternalError', message: error.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).lean()
    if (!event) return res.status(404).json({ error: 'NotFound', message: 'Event not found.' })
    res.json({ event })
  } catch (error) {
    res.status(500).json({ error: 'InternalError', message: error.message })
  }
})

module.exports = router
