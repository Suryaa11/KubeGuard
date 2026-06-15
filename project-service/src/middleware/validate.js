const Joi = require('joi')

const githubUrl = Joi.string().uri().pattern(/^https:\/\/github\.com\//).messages({
  'string.pattern.base': 'Must be a valid GitHub URL starting with https://github.com/',
})

const folderPath = Joi.string().pattern(/^\//).messages({
  'string.pattern.base': 'Folder path must start with /',
})

const projectSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  githubRepoUrl: githubUrl.required(),
  branch: Joi.string().min(1).max(100).default('main'),
  folderPath: folderPath.required(),
  prometheusUrl: Joi.string().uri().required(),
  argocdUrl: Joi.string().uri().required(),
  argocdAppName: Joi.string().min(1).required(),
  argocdToken: Joi.string().min(1).required(),
  kubernetesToken: Joi.string().optional().allow('', null),
  kubernetesApiUrl: Joi.string().uri().optional().allow('', null),
})

const updateSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  prometheusUrl: Joi.string().uri().optional(),
  argocdUrl: Joi.string().uri().optional(),
  argocdAppName: Joi.string().min(1).optional(),
  argocdToken: Joi.string().min(1).optional(),
  kubernetesToken: Joi.string().optional().allow('', null),
  kubernetesApiUrl: Joi.string().uri().optional().allow('', null),
  branch: Joi.string().min(1).max(100).optional(),
  folderPath: folderPath.optional(),
})

const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  })

  if (error) {
    const details = {}
    error.details.forEach((detail) => {
      const key = detail.context?.key || detail.path?.join('.') || 'unknown'
      details[key] = detail.message
    })
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Request validation failed',
      details,
    })
  }

  req.body = value
  return next()
}

module.exports = { validate, projectSchema, updateSchema }
