const router = require('express').Router()
const axios = require('axios')
const Project = require('../models/Project')
const { validate, projectSchema, updateSchema } = require('../middleware/validate')
const { encrypt } = require('../utils/encrypt')
const { registerWebhook, deleteWebhook } = require('../services/githubWebhook')

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

async function findAccessibleProject(req, id) {
  const { userId, roles } = getUser(req)
  const project = await Project.findById(id)
  if (!project) return null
  if (isAdmin(roles) || project.createdBy === userId) return project
  return null
}

router.post('/', validate(projectSchema), async (req, res, next) => {
  try {
    const { userId, email } = getUser(req)
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

    let prometheusAvailable = false
    try {
      await axios.get(`${req.body.prometheusUrl}/api/v1/status/runtimeinfo`, { timeout: 5000 })
      prometheusAvailable = true
    } catch (error) {
      prometheusAvailable = false
    }

    const webhookSecret = require('crypto').randomBytes(32).toString('hex')
    const project = new Project({
      ...req.body,
      createdBy: userId,
      createdByEmail: email,
      prometheusAvailable,
      argocdToken: encrypt(req.body.argocdToken),
      kubernetesToken: encrypt(req.body.kubernetesToken),
      webhookSecret,
    })

    const warnings = []
    try {
      project.githubWebhookId = await registerWebhook(project.githubRepoUrl, webhookSecret, project._id.toString())
    } catch (error) {
      warnings.push('GitHub webhook registration failed. Project was still saved.')
    }

    await project.save()

    return res.status(201).json({
      project: project.toSafeJSON(),
      warnings,
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const { userId, roles } = getUser(req)
    const query = isAdmin(roles) ? {} : { createdBy: userId }
    const projects = await Project.find(query).sort({ createdAt: -1 })
    return res.json({ projects: projects.map((project) => project.toSafeJSON()) })
  } catch (error) {
    return next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const project = await findAccessibleProject(req, req.params.id)
    if (!project) {
      return res.status(404).json({ error: 'NotFound', message: 'Project not found.' })
    }
    return res.json({ project: project.toSafeJSON() })
  } catch (error) {
    return next(error)
  }
})

router.put('/:id', validate(updateSchema), async (req, res, next) => {
  try {
    const project = await findAccessibleProject(req, req.params.id)
    if (!project) {
      return res.status(404).json({ error: 'NotFound', message: 'Project not found.' })
    }

    const immutableFields = ['githubRepoUrl', 'branch', 'folderPath']
    immutableFields.forEach((field) => {
      delete req.body[field]
    })

    if (Object.prototype.hasOwnProperty.call(req.body, 'argocdToken')) {
      req.body.argocdToken = encrypt(req.body.argocdToken)
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'kubernetesToken')) {
      req.body.kubernetesToken = encrypt(req.body.kubernetesToken)
    }

    Object.assign(project, req.body)
    await project.save()
    return res.json({ project: project.toSafeJSON() })
  } catch (error) {
    return next(error)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const project = await findAccessibleProject(req, req.params.id)
    if (!project) {
      return res.status(404).json({ error: 'NotFound', message: 'Project not found.' })
    }

    await deleteWebhook(project.githubRepoUrl, project.githubWebhookId)
    await Project.deleteOne({ _id: project._id })

    return res.json({ success: true, message: 'Project deleted and GitHub webhook removed.' })
  } catch (error) {
    return next(error)
  }
})

router.get('/:id/status', async (req, res, next) => {
  try {
    const project = await findAccessibleProject(req, req.params.id)
    if (!project) {
      return res.status(404).json({ error: 'NotFound', message: 'Project not found.' })
    }

    return res.json({
      projectId: project._id,
      name: project.name,
      status: project.status,
      prometheusAvailable: project.prometheusAvailable,
      lastEventAt: project.lastEventAt,
    })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
