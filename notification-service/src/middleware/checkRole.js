function parseRoles(req) {
  return String(req.header('x-user-roles') || '')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean)
}

function requireRole(requiredRole) {
  return (req, res, next) => {
    const roles = parseRoles(req)
    if (!roles.includes(requiredRole)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Requires ${requiredRole} role`,
      })
    }

    req.user = {
      id: req.header('x-user-id') || '',
      email: req.header('x-user-email') || '',
      name: req.header('x-user-name') || '',
      roles,
    }

    return next()
  }
}

module.exports = { requireRole, parseRoles }
