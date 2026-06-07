const express = require('express')
const crypto = require('crypto')
const axios = require('axios')
const Event = require('../models/Event')
const { parseSemanticChanges, filterMonitoredFiles } = require('../services/diffParser')
const { pauseSync } = require('../services/argocd')

const router = express.Router()

function buildRawDiff(commits, monitoredFiles) {
  const lines = []
  for (const commit of commits) {
    for (const file of commit.modified || []) {
      if (monitoredFiles.includes(file)) {
        lines.push(`diff --git a/${file} b/${file}`)
        lines.push(`--- a/${file}`)
        lines.push(`+++ b/${file}`)
        if (commit.patch) lines.push(commit.patch)
      }
    }
  }
  return lines.join('\n')
}

async function triggerAnalysis(eventId, projectId) {
  try {
    await Event.findByIdAndUpdate(eventId, {
      status: 'analyzing',
      analysisStartedAt: new Date(),
    })

    await axios.post(
      `${process.env.ANALYSIS_SERVICE_URL}/internal/analyze`,
      { eventId, projectId },
      {
        headers: { 'x-internal-secret': process.env.INTERNAL_SECRET },
        timeout: 10000,
      }
    )
  } catch (error) {
    console.error(`[watcher] Failed to trigger analysis for event ${eventId}:`, error.message)
    await Event.findByIdAndUpdate(eventId, { status: 'error' })
  }
}

router.post('/:projectId', express.raw({ type: '*/*' }), async (req, res) => {
  const { projectId } = req.params

  let project
  try {
    const response = await axios.get(`${process.env.PROJECT_SERVICE_URL}/internal/projects/${projectId}`, {
      headers: { 'x-internal-secret': process.env.INTERNAL_SECRET },
      timeout: 5000,
    })
    project = response.data.project
  } catch (error) {
    console.error(`[watcher] Could not fetch project ${projectId}:`, error.message)
    return res.status(404).json({ error: 'NotFound', message: 'Project not found.' })
  }

  const signature = req.headers['x-hub-signature-256']
  if (!signature) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing webhook signature.' })
  }

  const expected = `sha256=${crypto
    .createHmac('sha256', project.webhookSecret)
    .update(req.body)
    .digest('hex')}`

  let signaturesMatch = false
  try {
    signaturesMatch = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    signaturesMatch = false
  }

  if (!signaturesMatch) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid webhook signature.' })
  }

  let payload
  try {
    payload = JSON.parse(req.body.toString('utf8'))
  } catch {
    return res.status(400).json({ error: 'BadRequest', message: 'Invalid JSON payload.' })
  }

  const pushedBranch = (payload.ref || '').replace('refs/heads/', '')
  if (pushedBranch !== project.branch) {
    return res.status(200).json({ message: `Branch '${pushedBranch}' is not monitored. Skipping.` })
  }

  const commits = payload.commits || []
  const allChangedFiles = commits.flatMap((commit) => [...(commit.added || []), ...(commit.modified || []), ...(commit.removed || [])])
  const monitoredChangedFiles = filterMonitoredFiles(allChangedFiles, project.folderPath)
  if (monitoredChangedFiles.length === 0) {
    return res.status(200).json({ message: 'No files changed in the monitored folder. Skipping.' })
  }

  const latestCommit = commits[commits.length - 1] || {}
  const commitSha = payload.after || latestCommit.id || ''
  const commitMessage = latestCommit.message || ''
  const commitUrl = latestCommit.url || ''
  const author = latestCommit.author?.name || payload.pusher?.name || ''
  const authorEmail = latestCommit.author?.email || ''
  const rawDiff = buildRawDiff(commits, monitoredChangedFiles)
  const semanticChanges = parseSemanticChanges(rawDiff)

  const argoResult = await pauseSync(project.argocdUrl, project.argocdToken, project.argocdAppName)

  const event = new Event({
    projectId: project._id,
    projectName: project.name,
    commitSha,
    commitMessage,
    commitUrl,
    author,
    authorEmail,
    changedFiles: allChangedFiles,
    monitoredChangedFiles,
    semanticChanges,
    rawDiff,
    status: 'detected',
    argocdPaused: argoResult.success,
    argocdPauseError: argoResult.error,
  })

  await event.save()

  res.status(200).json({
    message: 'Change detected. Analysis triggered.',
    eventId: event._id.toString(),
  })

  triggerAnalysis(event._id.toString(), project._id.toString())
})

module.exports = router
