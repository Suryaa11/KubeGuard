const router = require('express').Router()
const Report = require('../models/Report')
const { getReportContent } = require('../services/blobStorage')
const { checkInternal } = require('../middleware/checkInternal')

async function buildReportResponse(eventId) {
  const report = await Report.findOne({ eventId }).lean()
  if (!report) return null

  const blobContent = await getReportContent(report.reportBlobPath).catch(() => null)
  return { report, blobContent }
}

router.get('/', async (req, res) => {
  try {
    const { projectId, riskScore, recommendation, decision, page = 1, limit = 20 } = req.query

    const filter = {}
    if (projectId) filter.projectId = projectId
    if (riskScore) filter.riskScore = Number(riskScore)
    if (recommendation) filter.recommendation = recommendation
    if (decision) filter.adminDecision = decision

    const pageNumber = Math.max(1, Number(page) || 1)
    const limitNumber = Math.min(100, Math.max(1, Number(limit) || 20))

    const [items, total] = await Promise.all([
      Report.find(filter)
        .sort({ generatedAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .lean(),
      Report.countDocuments(filter),
    ])

    res.json({
      reports: items,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        pages: Math.ceil(total / limitNumber),
      },
    })
  } catch (error) {
    res.status(500).json({ error: 'InternalError', message: error.message })
  }
})

router.get('/internal/:eventId', checkInternal, async (req, res) => {
  try {
    const response = await buildReportResponse(req.params.eventId)
    if (!response) {
      return res.status(404).json({ error: 'NotFound', message: 'Report not found.' })
    }

    res.json(response)
  } catch (error) {
    res.status(500).json({ error: 'InternalError', message: error.message })
  }
})

router.get('/:eventId', async (req, res) => {
  try {
    const response = await buildReportResponse(req.params.eventId)
    if (!response) {
      return res.status(404).json({ error: 'NotFound', message: 'Report not found.' })
    }

    res.json(response)
  } catch (error) {
    res.status(500).json({ error: 'InternalError', message: error.message })
  }
})

module.exports = router
