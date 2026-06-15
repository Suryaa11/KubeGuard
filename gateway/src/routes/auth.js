const router = require('express').Router()
const { verifyAccessToken } = require('../middleware/validateToken')

router.post('/token', async (req, res) => {
  try {
    const user = await verifyAccessToken(req.headers.authorization)

    res.json({
      userId: user.oid,
      email: user.preferred_username || user.email || '',
      name: user.name || '',
      roles: user.roles || [],
    })
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' })
  }
})

module.exports = router
