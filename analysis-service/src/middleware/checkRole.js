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

    return next()
  }
}

function requireAuthenticatedHeaders(req, res, next) {
  if (!req.header('x-user-id') || !req.header('x-user-roles')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User headers are required',
    })
  }

  req.user = {
    id: req.header('x-user-id'),
    email: req.header('x-user-email') || null,
    name: req.header('x-user-name') || null,
    roles: parseRoles(req),
  }

  return next()
}

module.exports = { requireRole, requireAuthenticatedHeaders, parseRoles }
