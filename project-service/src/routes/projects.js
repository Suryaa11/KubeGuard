const crypto = require('crypto')
const router = require('express').Router()
const axios = require('axios')
const Project = require('../models/Project')
const { validate, projectSchema, updateSchema } = require('../middleware/validate')
const { encrypt } = require('../utils/encrypt')
const { registerWebhook, deleteWebhook } = require('../services/githubWebhook')
const { ForbiddenError, NotFoundError } = require('../utils/errors')
const logger = require('../utils/logger')

function getUser(req) {
  return {
    userId: req.headers['x-user-id'] || '',
    email: req.headers['x-user-email'] || '',
    roles: (req.headers['x-user-roles'] || '').split(',').map((item) => item.trim()).filter(Boolean),
  }
}

function isAdmin(roles) {
  return roles.includes('Admin')
}

async function getProjectForUser(req, id) {
  const { userId, roles } = getUser(req)
  const project = await Project.findById(id)
  if (!project) throw new NotFoundError('Project not found.')
  if (!isAdmin(roles) && project.createdBy !== userId) {
    throw new ForbiddenError('You do not have access to this project.')
  }
  return project
}

async function checkPrometheus(prometheusUrl) {
  try {
    await axios.get(`${prometheusUrl}/api/v1/status/runtimeinfo`, { timeout: 3000 })
    return true
  } catch (error) {
    return false
  }
}

async function refreshPrometheusAvailability(projectId, prometheusUrl) {
  const prometheusAvailable = await checkPrometheus(prometheusUrl)
  await Project.findByIdAndUpdate(projectId, { prometheusAvailable })
  return prometheusAvailable
}

router.post('/', validate(projectSchema), async (req, res, next) => {
  try {
    const { userId, email } = getUser(req)
    const warnings = []

    const existing = await Project.findOne({
      githubRepoUrl: req.body.githubRepoUrl,
      branch: req.body.branch,
      folderPath: req.body.folderPath,
    })

    if (existing) {
      return res.status(409).json({
        error: 'DuplicateProject',
        message: 'This repository, branch, and folder combination is already being monitored.',
      })
    }

    const webhookSecret = crypto.randomBytes(32).toString('hex')
    const project = new Project({
      ...req.body,
      createdBy: userId,
      createdByEmail: email,
      prometheusAvailable: false,
      argocdToken: encrypt(req.body.argocdToken),
      kubernetesToken: req.body.kubernetesToken ? encrypt(req.body.kubernetesToken) : null,
      webhookSecret,
    })

    warnings.push('Prometheus availability check is running in the background.')

    // Save project immediately and respond; do not block on external dependency checks.
    await project.save()
    res.status(201).json({ project: project.toSafeJSON(), warnings })

    refreshPrometheusAvailability(project._id, req.body.prometheusUrl)
      .then((prometheusAvailable) => {
        logger.info(`Prometheus availability for project ${project._id}: ${prometheusAvailable}`)
      })
      .catch((err) => {
        logger.warn(`Prometheus availability check failed for project ${project._id}: ${err.message}`)
      })

    // Register webhook in background (non-blocking)
    registerWebhook(project.githubRepoUrl, project._id.toString(), webhookSecret)
      .then(async (webhookResult) => {
        if (webhookResult.success) {
          await Project.findByIdAndUpdate(project._id, { githubWebhookId: webhookResult.webhookId })
          logger.info(`[project-service] Webhook registered for project ${project._id}`)
        } else {
          logger.warn(`[project-service] Webhook registration failed for project ${project._id}: ${webhookResult.error}`)
        }
      })
      .catch((err) => {
        logger.error(`[project-service] Webhook registration error for project ${project._id}: ${err.message}`)
      })

  } catch (error) {
    return next(error)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const { userId, roles } = getUser(req)
    const page = Math.max(Number(req.query.page) || 1, 1)
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
    const query = isAdmin(roles) ? {} : { createdBy: userId }

    if (req.query.status) {
      query.status = req.query.status
    }

    const [projects, total] = await Promise.all([
      Project.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Project.countDocuments(query),
    ])

    return res.json({
      projects: projects.map((project) => project.toSafeJSON()),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/:id/status', async (req, res, next) => {
  try {
    const project = await getProjectForUser(req, req.params.id)
    return res.json({
      projectId: project._id,
      name: project.name,
      status: project.status,
      prometheusAvailable: project.prometheusAvailable,
      lastEventAt: project.lastEventAt,
      githubWebhookId: project.githubWebhookId,
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const project = await getProjectForUser(req, req.params.id)
    return res.json({ project: project.toSafeJSON() })
  } catch (error) {
    return next(error)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const project = await getProjectForUser(req, req.params.id)
    const result = await deleteWebhook(project.githubRepoUrl, project.githubWebhookId)
    if (!result.success) {
      logger.warn(`GitHub webhook deletion failed for project ${project._id}: ${result.error}`)
    }

    await Project.deleteOne({ _id: project._id })
    return res.status(204).send()
  } catch (error) {
    return next(error)
  }
})

router.put('/:id', validate(updateSchema), async (req, res, next) => {
  try {
    const project = await getProjectForUser(req, req.params.id)
    const warnings = []

    if (req.body.prometheusUrl && req.body.prometheusUrl !== project.prometheusUrl) {
      project.prometheusAvailable = await checkPrometheus(req.body.prometheusUrl)
      if (!project.prometheusAvailable) {
        warnings.push('Prometheus check failed. Project was still updated.')
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'argocdToken')) {
      req.body.argocdToken = encrypt(req.body.argocdToken)
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'kubernetesToken')) {
      req.body.kubernetesToken = encrypt(req.body.kubernetesToken)
    }

    Object.assign(project, req.body)
    await project.save()
    return res.json({ project: project.toSafeJSON(), warnings })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
