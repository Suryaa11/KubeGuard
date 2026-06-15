const router = require('express').Router()

const Report = require('../models/Report')
const { downloadReport } = require('../services/blobStorage')
const { requireAuthenticatedHeaders } = require('../middleware/checkRole')

function applyOwnershipFilter(filter, req) {
  if (req.user.roles.includes('Admin')) {
    return filter
  }

  if (req.user.roles.includes('DevOpsEngineer')) {
    return { ...filter, ownerId: req.user.id }
  }

  return { ...filter, _id: null }
}

router.use(requireAuthenticatedHeaders)

router.get('/', async (req, res, next) => {
  try {
    const { projectId, riskScore, recommendation, decision } = req.query
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))

    let filter = {}
    if (projectId) filter.projectId = projectId
    if (riskScore) filter.riskScore = String(riskScore).toLowerCase()
    if (recommendation) filter.recommendation = recommendation
    if (decision) filter.adminDecision = decision
    filter = applyOwnershipFilter(filter, req)

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .sort({ generatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Report.countDocuments(filter),
    ])

    return res.json({
      reports,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/:eventId', async (req, res, next) => {
  try {
    const filter = applyOwnershipFilter({ eventId: req.params.eventId }, req)
    const metadata = await Report.findOne(filter).lean()

    if (!metadata) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Report not found',
      })
    }

    const fullReport = await downloadReport(metadata.projectId, metadata.eventId)
    if (fullReport) {
      return res.json({
        ...fullReport,
        adminDecision: metadata.adminDecision,
        decidedBy: metadata.decidedBy,
        decidedByEmail: metadata.decidedByEmail,
        decisionNote: metadata.decisionNote,
        decidedAt: metadata.decidedAt,
      })
    }
    return res.json(metadata)
  } catch (error) {
    return next(error)
  }
})

module.exports = router
