const express = require('express')
const Event = require('../models/Event')
const { checkInternal } = require('../middleware/checkInternal')

const router = express.Router()

router.use(checkInternal)

router.patch('/events/:id/status', async (req, res) => {
  try {
    const { status, reportBlobUrl } = req.body
    const validStatuses = ['detected', 'analyzing', 'pending_approval', 'approved', 'rejected', 'error']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'ValidationError', message: `Invalid status: ${status}` })
    }

    const update = { status }
    if (reportBlobUrl) update.reportBlobUrl = reportBlobUrl
    if (status === 'approved' || status === 'rejected') update.resolvedAt = new Date()

    const event = await Event.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
    if (!event) return res.status(404).json({ error: 'NotFound', message: 'Event not found.' })

    res.json({ event })
  } catch (error) {
    res.status(500).json({ error: 'InternalError', message: error.message })
  }
})

router.get('/events/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).lean()
    if (!event) return res.status(404).json({ error: 'NotFound', message: 'Event not found.' })
    res.json({ event })
  } catch (error) {
    res.status(500).json({ error: 'InternalError', message: error.message })
  }
})

module.exports = router
