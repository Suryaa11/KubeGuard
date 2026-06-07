const { v4: uuidv4 } = require('uuid')

const extractUserHeaders = (req, res, next) => {
  const user = req.entraUser || {}
  req.headers['x-user-id'] = user.oid || user.sub
  req.headers['x-user-email'] = user.email || user.preferred_username || ''
  req.headers['x-user-name'] = user.name || ''
  req.headers['x-user-roles'] = Array.isArray(user.roles) ? user.roles.join(',') : user.roles || ''
  req.headers['x-request-id'] = uuidv4()

  delete req.headers.authorization

  next()
}

module.exports = { extractUserHeaders }
