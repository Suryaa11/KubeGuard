const axios = require('axios')
const Joi = require('joi')
const router = require('express').Router()
const { v4: uuidv4 } = require('uuid')

const Report = require('../models/Report')
const checkInternal = require('../middleware/checkInternal')
const validate = require('../middleware/validate')
const { generateReport } = require('../services/aiClient')
const { queryLiveMetrics, queryHistoricalPeak } = require('../services/prometheus')
const { uploadReport, downloadReport } = require('../services/blobStorage')
const { publishMessage } = require('../services/serviceBus')
const { buildPrompt, buildChangesSummary } = require('../utils/promptBuilder')
const logger = require('../utils/logger')

const analyzeSchema = Joi.object({
  eventId: Joi.string().required(),
  projectId: Joi.string().required(),
})

const decisionSchema = Joi.object({
  adminDecision: Joi.string().valid('approved', 'rejected').required(),
  decidedBy: Joi.string().allow('', null),
  decidedByEmail: Joi.string().allow('', null),
  decisionNote: Joi.string().allow('', null),
  decidedAt: Joi.date().default(() => new Date()),
})

function serviceHeaders() {
  return { 'x-internal-secret': process.env.INTERNAL_SECRET }
}

function trimTrailingSlash(url) {
  return String(url || '').replace(/\/$/, '')
}

async function fetchEvent(eventId) {
  const response = await axios.get(
    `${trimTrailingSlash(process.env.WATCHER_SERVICE_URL)}/internal/events/${eventId}`,
    {
      headers: serviceHeaders(),
      timeout: 15000,
    }
  )

  return response.data?.event || response.data
}

async function fetchProject(projectId) {
  const response = await axios.get(
    `${trimTrailingSlash(process.env.PROJECT_SERVICE_URL)}/internal/projects/${projectId}`,
    {
      headers: serviceHeaders(),
      timeout: 15000,
    }
  )

  return response.data?.project || response.data
}

async function updateEventStatus(eventId, status, extra = {}) {
  try {
    await axios.patch(
      `${trimTrailingSlash(process.env.WATCHER_SERVICE_URL)}/internal/events/${eventId}/status`,
      { status, ...extra },
      {
        headers: serviceHeaders(),
        timeout: 15000,
      }
    )
  } catch (error) {
    logger.warn(`Failed to update event ${eventId} status to ${status}: ${error.message}`)
  }
}

function normalizeId(value) {
  return String(value || '')
}

function projectOwnerId(project) {
  return (
    project.ownerId ||
    project.createdBy ||
    project.userId ||
    project.createdByUserId ||
    project.owner?.id ||
    null
  )
}

async function runAnalysis(eventId, projectId) {
  try {
    await updateEventStatus(eventId, 'analyzing')

    let event
    let project

    try {
      event = await fetchEvent(eventId)
      project = await fetchProject(projectId)
    } catch (error) {
      logger.error(`Failed to fetch event or project: ${error.message}`)
      return
    }

    const appName = project.argocdAppName || project.appName || project.name
    const shouldQueryPrometheus = Boolean(project.prometheusUrl && project.prometheusAvailable)

    const [liveMetrics, historicalPeak] = shouldQueryPrometheus
      ? await Promise.all([
          queryLiveMetrics(project.prometheusUrl, appName),
          queryHistoricalPeak(project.prometheusUrl, appName),
        ])
      : [
          { available: false },
          { available: false },
        ]

    const prompt = buildPrompt({ event, project, liveMetrics, historicalPeak })
    const ai = await generateReport(prompt)
    const generatedAt = new Date()
    const reportId = uuidv4()
    const changesSummary = buildChangesSummary(event.semanticChanges)

    const reportObject = {
      reportId,
      eventId: normalizeId(event._id || event.eventId || eventId),
      projectId: normalizeId(project._id || project.projectId || projectId),
      projectName: project.name || project.projectName || '',
      generatedAt: generatedAt.toISOString(),
      changesSummary,
      semanticChanges: event.semanticChanges || [],
      liveMetrics,
      historicalPeak,
      riskScore: ai.riskScore,
      riskReason: ai.riskReason,
      prediction: ai.prediction,
      recommendation: ai.recommendation,
      reportMarkdown: ai.reportMarkdown,
      adminDecision: null,
      decidedBy: null,
      decidedByEmail: null,
      decisionNote: null,
      decidedAt: null,
      argocdResumed: false,
    }

    const uploadResult = await uploadReport(reportObject.projectId, reportObject.eventId, reportObject)

    await Report.findOneAndUpdate(
      { eventId: reportObject.eventId },
      {
        reportId,
        eventId: reportObject.eventId,
        projectId: reportObject.projectId,
        projectName: reportObject.projectName,
        riskScore: reportObject.riskScore,
        recommendation: reportObject.recommendation,
        reportBlobPath: uploadResult.blobName,
        reportBlobUrl: uploadResult.sasUrl,
        generatedAt,
        adminDecision: null,
        decidedAt: null,
        changesSummary,
        ownerId: projectOwnerId(project),
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    )

    await publishMessage({
      eventId: reportObject.eventId,
      projectId: reportObject.projectId,
      projectName: reportObject.projectName,
      riskScore: reportObject.riskScore,
      changesSummary,
      reportBlobUrl: uploadResult.sasUrl,
      adminEmails: [],
    })

    await updateEventStatus(eventId, 'pending_approval', {
      reportBlobUrl: uploadResult.sasUrl,
    })

    logger.info(`Analysis completed for event ${eventId}`)
  } catch (error) {
    logger.error(`Analysis failed for event ${eventId}: ${error.message}`)
    await updateEventStatus(eventId, 'error')
  }
}

router.use(checkInternal)

router.post('/analyze', validate(analyzeSchema), (req, res) => {
  const { eventId, projectId } = req.body

  res.status(202).json({
    message: 'Analysis started',
    eventId,
  })

  setImmediate(() => {
    runAnalysis(eventId, projectId)
  })
})

router.get('/reports/:eventId', async (req, res, next) => {
  try {
    const metadata = await Report.findOne({ eventId: req.params.eventId }).lean()
    if (!metadata) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Report not found',
      })
    }

    const fullReport = await downloadReport(metadata.projectId, metadata.eventId)
    return res.json(fullReport || metadata)
  } catch (error) {
    return next(error)
  }
})

router.patch('/reports/:eventId/decision', validate(decisionSchema), async (req, res, next) => {
  try {
    const updatedReport = await Report.findOneAndUpdate(
      { eventId: req.params.eventId },
      {
        adminDecision: req.body.adminDecision,
        decidedBy: req.body.decidedBy,
        decidedByEmail: req.body.decidedByEmail,
        decisionNote: req.body.decisionNote,
        decidedAt: req.body.decidedAt,
      },
      { new: true }
    ).lean()

    if (!updatedReport) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Report not found',
      })
    }

    return res.json({ report: updatedReport })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
module.exports.runAnalysis = runAnalysis
module.exports.updateEventStatus = updateEventStatus
