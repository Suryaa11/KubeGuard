const router = require('express').Router()
const { validateEntraToken } = require('../middleware/validateEntraToken')

router.post('/token', validateEntraToken, (req, res) => {
  const user = req.entraUser
  res.json({
    userId: user.oid || user.sub,
    email: user.email || user.preferred_username || '',
    name: user.name || '',
    roles: Array.isArray(user.roles) ? user.roles : user.roles ? [user.roles] : [],
  })
})

module.exports = router
