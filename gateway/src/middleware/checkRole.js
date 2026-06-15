const requireRole = (requiredRole) => (req, res, next) => {
  const roles = (req.headers['x-user-roles'] || '').split(',').map((role) => role.trim())

  if (!roles.includes(requiredRole)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: `This action requires the ${requiredRole} role.`,
    })
  }

  return next()
}

module.exports = requireRole
