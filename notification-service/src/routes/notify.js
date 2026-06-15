const axios = require('axios')
const Joi = require('joi')
const router = require('express').Router()

const Decision = require('../models/Decision')
const { requireRole } = require('../middleware/checkRole')
const { verifyApprovalToken } = require('../services/approvalToken')
const { resumeArgocdSync } = require('../services/argocd')
const { ConflictError, UnauthorizedError, ValidationAppError } = require('../utils/errors')

const decideSchema = Joi.object({
  eventId: Joi.string().required(),
  decision: Joi.string().valid('approved', 'rejected').required(),
  note: Joi.string().allow('', null),
})

function internalHeaders() {
  return { 'x-internal-secret': process.env.INTERNAL_SECRET }
}

function trimTrailingSlash(url) {
  return String(url || '').replace(/\/$/, '')
}

async function fetchReport(eventId) {
  const response = await axios.get(
    `${trimTrailingSlash(process.env.ANALYSIS_SERVICE_URL)}/internal/reports/${eventId}`,
    {
      headers: internalHeaders(),
      timeout: 15000,
    }
  )
  return response.data?.report || response.data
}

async function fetchProject(projectId) {
  const response = await axios.get(
    `${trimTrailingSlash(process.env.PROJECT_SERVICE_URL)}/internal/projects/${projectId}`,
    {
      headers: internalHeaders(),
      timeout: 15000,
    }
  )
  return response.data?.project || response.data
}

async function updateEventStatus(eventId, decision) {
  await axios.patch(
    `${trimTrailingSlash(process.env.WATCHER_SERVICE_URL)}/internal/events/${eventId}/status`,
    { status: decision === 'approved' ? 'approved' : 'rejected' },
    {
      headers: internalHeaders(),
      timeout: 15000,
    }
  )
}

async function updateReportDecision(eventId, payload) {
  const url = `${trimTrailingSlash(process.env.ANALYSIS_SERVICE_URL)}/internal/reports/${eventId}/decision`;
  console.log('[DEBUG] updateReportDecision URL:', url);
  console.log('[DEBUG] payload:', JSON.stringify(payload));
  console.log('[DEBUG] secret set:', !!process.env.INTERNAL_SECRET);
  try {
    const resp = await axios.patch(url, payload, { headers: internalHeaders(), timeout: 15000 });
    console.log('[DEBUG] response status:', resp.status);
    return resp;
  } catch (err) {
    console.error('[DEBUG] PATCH failed:', err.message, err.response?.status, JSON.stringify(err.response?.data));
    throw err;
  }
}

async function recordDecision({ eventId, decision, note, actor, source }) {
  const existingDecision = await Decision.findOne({ eventId }).lean()
  if (existingDecision) {
    throw new ConflictError('Decision already recorded')
  }

  const report = await fetchReport(eventId)
  const projectId = report.projectId
  let argocdResult = { success: false, error: null }

  if (decision === 'approved') {
    const project = await fetchProject(projectId)
    argocdResult = await resumeArgocdSync(
      project.argocdUrl,
      project.argocdToken,
      project.argocdAppName || project.appName || project.name
    )
  }

  const decidedAt = new Date()
  const savedDecision = await Decision.create({
    eventId,
    projectId,
    reportBlobUrl: report.reportBlobUrl,
    decision,
    decidedBy: actor.id,
    decidedByEmail: actor.email,
    decisionNote: note,
    decidedAt,
    argocdResumed: Boolean(argocdResult.success),
    argocdResumeError: argocdResult.success ? undefined : argocdResult.error,
    source,
  })

  await updateEventStatus(eventId, decision)
  await updateReportDecision(eventId, {
    adminDecision: decision,
    decidedBy: actor.id,
    decidedByEmail: actor.email,
    decisionNote: note,
    decidedAt,
  })

  return savedDecision
}

router.get('/decide', async (req, res, next) => {
  try {
    const { token } = req.query
    if (!token) {
      throw new ValidationAppError('Token is required')
    }

    let tokenPayload
    try {
      tokenPayload = verifyApprovalToken(token)
    } catch (error) {
      throw new UnauthorizedError('Invalid token')
    }

    const existingDecision = await Decision.findOne({ eventId: tokenPayload.eventId }).lean()
    if (existingDecision) {
      return res.redirect(`${trimTrailingSlash(process.env.FRONTEND_URL)}/projects/already-decided`)
    }

    const decision = await recordDecision({
      eventId: tokenPayload.eventId,
      decision: tokenPayload.decision,
      note: undefined,
      actor: { id: 'email-link', email: 'via-email' },
      source: 'email',
    })

    return res.redirect(
      `${trimTrailingSlash(process.env.FRONTEND_URL)}/events/${decision.eventId}?decided=true&decision=${decision.decision}`
    )
  } catch (error) {
    return next(error)
  }
})

router.post('/decide', requireRole('Admin'), async (req, res, next) => {
  try {
    const { error, value } = decideSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    })
    if (error) {
      error.isJoi = true
      throw error
    }

    const decision = await recordDecision({
      eventId: value.eventId,
      decision: value.decision,
      note: value.note,
      actor: {
        id: req.headers['x-user-id'] || 'unknown-admin',
        email: req.headers['x-user-email'] || '',
      },
      source: 'dashboard',
    })

    return res.json({
      decision: decision.decision,
      eventId: decision.eventId,
      argocdResumed: decision.argocdResumed,
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/decisions', requireRole('Admin'), async (req, res, next) => {
  try {
    const { projectId, decision } = req.query
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))

    const filter = {}
    if (projectId) filter.projectId = projectId
    if (decision) filter.decision = decision

    const [decisions, total] = await Promise.all([
      Decision.find(filter)
        .sort({ decidedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Decision.countDocuments(filter),
    ])

    return res.json({
      decisions,
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

module.exports = router
