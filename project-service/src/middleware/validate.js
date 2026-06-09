const Joi = require('joi')

const projectSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),

  githubRepoUrl: Joi.string()
    .uri()
    .pattern(/^https:\/\/github\.com\//)
    .required()
    .messages({
      'string.pattern.base': 'Must be a valid GitHub URL starting with https://github.com/',
    }),

  branch: Joi.string().min(1).max(100).default('main'),

  folderPath: Joi.string()
    .pattern(/^\//)
    .default('/helm')
    .messages({
      'string.pattern.base': 'Folder path must start with /',
    }),

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
  argocdToken: Joi.string().min(1).optional(),   // optional on update — omit to keep existing
  kubernetesToken: Joi.string().optional().allow('', null),
  kubernetesApiUrl: Joi.string().uri().optional().allow('', null),
  // githubRepoUrl, branch, folderPath intentionally excluded — immutable
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
  next()
}

module.exports = { validate, projectSchema, updateSchema }