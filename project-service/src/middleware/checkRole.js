const requireRole = (requiredRole) => (req, res, next) => {
  const roles = (req.headers['x-user-roles'] || '')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean)

  if (!roles.includes(requiredRole)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have permission to perform this action.',
      details: {},
    })
  }

  return next()
}

module.exports = { requireRole }
