const checkInternal = (req, res, next) => {
  const secret = req.headers['x-internal-secret']
  if (!secret || secret !== process.env.INTERNAL_SECRET) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Internal access only.',
    })
  }
  next()
}

module.exports = { checkInternal }
