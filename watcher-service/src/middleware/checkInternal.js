const { UnauthorizedError } = require('../utils/errors')

function checkInternal(req, res, next) {
  const secret = req.headers['x-internal-secret']
  if (!secret || secret !== process.env.INTERNAL_SECRET) {
    return next(new UnauthorizedError('Internal access only'))
  }

  next()
}

module.exports = { checkInternal }
