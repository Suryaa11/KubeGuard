const express = require('express')
const axios = require('axios')
const Event = require('../models/Event')
const { verifyGithubSignature } = require('../services/hmac')
const { buildRawDiff, filterMonitoredFiles, parseSemanticChanges } = require('../services/diffParser')
const { pauseArgocdSync } = require('../services/argocd')
const { triggerAnalysis } = require('../services/analysisClient')
const { BadRequestError, NotFoundError, UnauthorizedError } = require('../utils/errors')
const logger = require('../utils/logger')

const router = express.Router()

function normalizeProject(projectResponse) {
  return projectResponse.data.project || projectResponse.data
}

async function fetchProject(projectId) {
  try {
    const response = await axios.get(`${process.env.PROJECT_SERVICE_URL}/internal/projects/${projectId}`, {
      headers: { 'x-internal-secret': process.env.INTERNAL_SECRET },
      timeout: 5000,
    })
    return normalizeProject(response)
  } catch (error) {
    throw new NotFoundError('Project not found')
  }
}

function collectChangedFiles(commits = []) {
  return [
    ...new Set(
      (commits || []).flatMap((commit) => [
        ...(commit.added || []),
        ...(commit.modified || []),
        ...(commit.removed || []),
      ])
    ),
  ]
}

function getProjectOwnerId(project) {
  return project.ownerId || project.userId || project.createdBy || project.createdById || ''
}

async function updateArgocdPauseResult(eventId, pausePromise) {
  const result = await pausePromise
  await Event.findByIdAndUpdate(eventId, {
    argocdPaused: result.success,
    argocdPauseError: result.error || '',
  })
}

async function startAnalysis(eventId, projectId) {
  try {
    await triggerAnalysis(eventId, projectId)
    await Event.findByIdAndUpdate(eventId, {
      status: 'analyzing',
      analysisStartedAt: new Date(),
    })
  } catch (error) {
    logger.error(`Failed to trigger analysis for event ${eventId}: ${error.message}`)
    await Event.findByIdAndUpdate(eventId, { status: 'error' })
  }
}

router.post('/:projectId', express.raw({ type: '*/*' }), async (req, res, next) => {
  try {
    const { projectId } = req.params
    const rawBody = req.body
    const signature = req.headers['x-hub-signature-256']

    if (!signature) {
      throw new UnauthorizedError('Missing webhook signature')
    }

    const project = await fetchProject(projectId)

    if (!verifyGithubSignature(rawBody, signature, project.webhookSecret)) {
      throw new UnauthorizedError('Invalid webhook signature')
    }

    let payload
    try {
      payload = JSON.parse(rawBody.toString('utf8'))
    } catch {
      throw new BadRequestError('Invalid JSON payload')
    }

    if (payload.ref !== `refs/heads/${project.branch}`) {
      return res.status(200).json({ monitored: false, message: 'Branch not monitored' })
    }

    const commits = payload.commits || []
    const changedFiles = collectChangedFiles(commits)
    const monitoredChangedFiles = filterMonitoredFiles(changedFiles, project.folderPath || '')

    if (monitoredChangedFiles.length === 0) {
      return res.status(200).json({ monitored: false, message: 'No monitored files changed' })
    }

    const latestCommit = commits[commits.length - 1] || payload.head_commit || {}
    const semanticChanges = await parseSemanticChanges(payload, project, monitoredChangedFiles)
    const rawDiff = buildRawDiff(commits, monitoredChangedFiles)

    const pausePromise = pauseArgocdSync(project.argocdUrl, project.argocdToken, project.argocdAppName)

    const event = await Event.create({
      projectId: project._id || project.id || projectId,
      projectName: project.name || project.projectName || 'Unknown project',
      projectOwnerId: getProjectOwnerId(project),
      commitSha: payload.after || latestCommit.id || 'unknown',
      commitMessage: latestCommit.message || '',
      commitUrl: payload.head_commit?.url || latestCommit.url || payload.compare || '',
      author: latestCommit.author?.name || payload.pusher?.name || '',
      authorEmail: latestCommit.author?.email || payload.pusher?.email || '',
      changedFiles,
      monitoredChangedFiles,
      semanticChanges,
      rawDiff,
      status: 'detected',
    })

    res.status(200).json({
      message: 'Analysis triggered',
      eventId: event._id.toString(),
      monitored: true,
    })

    setImmediate(async () => {
      try {
        await Promise.all([
          updateArgocdPauseResult(event._id, pausePromise),
          startAnalysis(event._id.toString(), String(project._id || project.id || projectId)),
        ])
      } catch (error) {
        logger.error(`Webhook background work failed for event ${event._id}: ${error.message}`)
      }
    })
  } catch (error) {
    next(error)
  }
})

module.exports = router
