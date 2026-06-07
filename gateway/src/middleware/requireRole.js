const requireRole = (role) => (req, res, next) => {
  const roles = (req.headers['x-user-roles'] || '').split(',').map((item) => item.trim())
  if (!roles.includes(role)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: `This action requires the ${role} role.`,
    })
  }
  next()
}

module.exports = { requireRole }
