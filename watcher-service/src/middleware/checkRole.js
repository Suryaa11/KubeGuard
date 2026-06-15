const { ForbiddenError } = require('../utils/errors')

function getRoles(req) {
  return String(req.headers['x-user-roles'] || '')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean)
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const roles = getRoles(req)
    if (!allowedRoles.some((role) => roles.includes(role))) {
      return next(new ForbiddenError('Insufficient role for this operation'))
    }

    req.user = {
      id: req.headers['x-user-id'] || '',
      email: req.headers['x-user-email'] || '',
      name: req.headers['x-user-name'] || '',
      roles,
      isAdmin: roles.includes('Admin'),
    }
    next()
  }
}

module.exports = { getRoles, requireRole }
