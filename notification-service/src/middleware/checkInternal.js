function checkInternal(req, res, next) {
  const secret = req.header('x-internal-secret')
  if (!secret || secret !== process.env.INTERNAL_SECRET) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid internal secret',
    })
  }

  return next()
}

module.exports = checkInternal
