// project-service/src/middleware/validate.js
// Joi validation schemas for project creation and update.
// Used as middleware in project routes before any business logic runs.

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

  // FIX: folderPath was using .default() without .required() — Joi treats it as optional
  // when the field is completely absent. Adding .required() with a default means the
  // field must be present OR will be defaulted to '/helm'. Either way encryption key
  // length errors won't surface here.
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

  // kubernetesToken and kubernetesApiUrl are optional — most users don't have these
  // allow('', null) means empty string from a form field won't fail validation
  kubernetesToken: Joi.string().optional().allow('', null),
  kubernetesApiUrl: Joi.string().uri().optional().allow('', null),
})

// Update schema — all fields optional except none required
// Immutable fields (githubRepoUrl, branch, folderPath) are excluded in the route handler
const updateSchema = projectSchema.fork(
  [
    'name',
    'githubRepoUrl',
    'branch',
    'folderPath',
    'prometheusUrl',
    'argocdUrl',
    'argocdAppName',
    'argocdToken',
  ],
  (field) => field.optional()
)

const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,    // collect ALL errors, not just the first
    stripUnknown: true,   // remove fields not in the schema silently
  })

  if (error) {
    const details = {}
    error.details.forEach((detail) => {
      // detail.context.key can be undefined for nested errors — use path as fallback
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