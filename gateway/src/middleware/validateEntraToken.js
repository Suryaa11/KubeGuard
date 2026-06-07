const jwt = require('jsonwebtoken')
const jwksRsa = require('jwks-rsa')

const jwksClient = jwksRsa({
  jwksUri: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 5,
})

const getSigningKey = (header, callback) => {
  jwksClient.getSigningKey(header.kid, (error, key) => {
    if (error) {
      callback(error)
      return
    }

    const signingKey = key.getPublicKey()
    callback(null, signingKey)
  })
}

const validateEntraToken = (req, res, next) => {
  const authorization = req.headers.authorization || ''
  const [, token] = authorization.split(' ')

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' })
  }

  jwt.verify(
    token,
    getSigningKey,
    {
      algorithms: ['RS256'],
      audience: [process.env.AZURE_CLIENT_ID, `api://${process.env.AZURE_CLIENT_ID}`],
      issuer: [
        `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`,
        `https://sts.windows.net/${process.env.AZURE_TENANT_ID}/`,
      ],
    },
    (error, decoded) => {
      if (error || !decoded) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' })
      }

      req.entraUser = decoded
      return next()
    }
  )
}

module.exports = { validateEntraToken }
