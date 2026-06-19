const express = require('express')
const Joi = require('joi')
const Event = require('../models/Event')
const { checkInternal } = require('../middleware/checkInternal')
const validate = require('../middleware/validate')
const { NotFoundError } = require('../utils/errors')
const router = express.Router()

const statusSchema = Joi.object({
  status: Joi.string().valid('detected', 'analyzing', 'pending_approval', 'approved', 'rejected', 'error').required(),
  reportBlobUrl: Joi.string().uri().optional().allow(null, ''),
})

router.use(checkInternal)

router.patch('/events/:id/status', validate(statusSchema), async (req, res, next) => {
  try {
    const { status, reportBlobUrl } = req.body
    const update = { status }
    if (reportBlobUrl) {
      update.reportBlobUrl = reportBlobUrl
    }
    if (status === 'analyzing') {
      update.analysisStartedAt = new Date()
    }
    if (status === 'approved' || status === 'rejected') {
      update.resolvedAt = new Date()
    }
    const event = await Event.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).lean()
    if (!event) {
      throw new NotFoundError('Event not found')
    }
    res.json({ event })
  } catch (error) {
    next(error)
  }
})

router.get('/events/:id', async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id).lean()
    if (!event) {
      throw new NotFoundError('Event not found')
    }
    res.json({ event })
  } catch (error) {
    next(error)
  }
})

module.exports = router
