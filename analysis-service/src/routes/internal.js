const axios = require('axios')
const router = require('express').Router()
const { v4: uuidv4 } = require('uuid')
const Report = require('../models/Report')
const { checkInternal } = require('../middleware/checkInternal')
const { getLiveMetrics, getHistoricalPeak } = require('../services/prometheus')
const { requestAnalysis, withRetry } = require('../services/aiClient')
const { uploadReport, getReportContent } = require('../services/blobStorage')
const { publishReportReady } = require('../services/serviceBus')

router.use(checkInternal)

function getHeaders() {
  return { 'x-internal-secret': process.env.INTERNAL_SECRET }
}

async function updateEventStatus(eventId, status, extra = {}) {
  const watcherUrl = process.env.WATCHER_SERVICE_URL || 'http://localhost:3002'
  await axios.patch(
    `${watcherUrl.replace(/\/$/, '')}/internal/events/${eventId}/status`,
    { status, ...extra },
    {
      headers: getHeaders(),
      timeout: 15000,
    }
  )
}

async function fetchEvent(eventId) {
  const watcherUrl = process.env.WATCHER_SERVICE_URL || 'http://localhost:3002'
  const response = await axios.get(`${watcherUrl.replace(/\/$/, '')}/internal/events/${eventId}`, {
    headers: getHeaders(),
    timeout: 15000,
  })
  return response.data?.event || null
}

async function fetchProject(projectId) {
  const projectServiceUrl = process.env.PROJECT_SERVICE_URL || 'http://localhost:3001'
  const response = await axios.get(`${projectServiceUrl.replace(/\/$/, '')}/internal/projects/${projectId}`, {
    headers: getHeaders(),
    timeout: 15000,
  })
  return response.data?.project || null
}

async function runWithRetry(label, operation) {
  try {
    return await withRetry(operation)
  } catch (error) {
    error.message = `${label} failed after retries: ${error.message}`
    throw error
  }
}

async function runAnalysis(eventId, projectId) {
  try {
    await updateEventStatus(eventId, 'analyzing')

    const [event, project] = await Promise.all([fetchEvent(eventId), fetchProject(projectId)])
    if (!event) throw new Error('Event not found')
    if (!project) throw new Error('Project not found')

    const metricsUrl = project.prometheusUrl || process.env.PROMETHEUS_URL || ''
    const [liveMetrics, historicalPeak] = await Promise.all([
      runWithRetry('Prometheus live metrics', async () => {
        const result = await getLiveMetrics(metricsUrl, project.argocdAppName)
        if (!result.available) throw new Error('Prometheus live metrics unavailable')
        return result
      }).catch(() => ({ available: false, cpuUsage: null, memoryUsage: null, replicas: null })),
      runWithRetry('Prometheus historical peak', async () => {
        const result = await getHistoricalPeak(metricsUrl, project.argocdAppName, 30)
        if (!result.available) throw new Error('Prometheus historical peak unavailable')
        return result
      }).catch(() => ({ available: false, cpuPeak: null, memoryPeak: null })),
    ])

    const metrics = {
      live: liveMetrics,
      peak: historicalPeak,
    }

    const aiReport = await runWithRetry('AI analysis', () => requestAnalysis(event, project, metrics))
    const reportId = aiReport.reportId || uuidv4()
    const generatedAt = new Date()

    const fullReport = {
      reportId,
      eventId: String(event._id),
      projectId: String(project._id),
      projectName: project.name,
      generatedAt: generatedAt.toISOString(),
      metrics,
      aiReport,
      event,
      project: {
        id: String(project._id),
        name: project.name,
        branch: project.branch,
        folderPath: project.folderPath,
        argocdAppName: project.argocdAppName,
        githubRepoUrl: project.githubRepoUrl,
      },
    }

    const uploadResult = await runWithRetry('Blob upload', () =>
      uploadReport(String(project._id), String(event._id), fullReport)
    )

    const reportDocument = {
      reportId,
      eventId: event._id,
      projectId: project._id,
      projectName: project.name,
      riskScore: Number(aiReport.riskScore ?? 50),
      recommendation: aiReport.recommendation || 'Review the change carefully before approving.',
      changesSummary: aiReport.changesSummary ?? null,
      reportBlobPath: uploadResult.blobPath,
      reportBlobUrl: uploadResult.blobUrl,
      metricsAvailable: Boolean(liveMetrics.available || historicalPeak.available),
      adminDecision: 'pending',
      decidedAt: null,
      decidedBy: null,
      decidedByEmail: null,
      generatedAt,
    }

    await Report.findOneAndUpdate({ eventId: event._id }, reportDocument, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    })

    await runWithRetry('Service Bus publish', () =>
      publishReportReady({
        reportId,
        eventId: String(event._id),
        projectId: String(project._id),
        projectName: project.name,
        reportBlobUrl: uploadResult.blobUrl,
        riskScore: reportDocument.riskScore,
        recommendation: reportDocument.recommendation,
      })
    )

    await updateEventStatus(eventId, 'pending_approval', {
      reportBlobUrl: uploadResult.blobUrl,
    })
  } catch (error) {
    console.error('[analysis-service] Analysis failed:', error.message)
    try {
      await updateEventStatus(eventId, 'error')
    } catch (statusError) {
      console.error('[analysis-service] Failed to update event status:', statusError.message)
    }
  }
}

router.post('/analyze', async (req, res) => {
  const { eventId, projectId } = req.body || {}
  if (!eventId || !projectId) {
    return res.status(400).json({ error: 'ValidationError', message: 'eventId and projectId are required.' })
  }

  setImmediate(() => {
    runAnalysis(eventId, projectId)
  })

  return res.status(202).json({
    status: 'accepted',
    message: 'Analysis request queued.',
    eventId,
    projectId,
  })
})

router.get('/reports/:eventId', async (req, res) => {
  try {
    const report = await Report.findOne({ eventId: req.params.eventId }).lean()
    if (!report) {
      return res.status(404).json({ error: 'NotFound', message: 'Report not found.' })
    }

    const blobContent = await getReportContent(report.reportBlobPath).catch(() => null)
    res.json({ report, blobContent })
  } catch (error) {
    res.status(500).json({ error: 'InternalError', message: error.message })
  }
})

module.exports = { router, runAnalysis, updateEventStatus }
