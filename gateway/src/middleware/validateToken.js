const jwt = require('jsonwebtoken')
const jwksRsa = require('jwks-rsa')

const jwksClient = jwksRsa({
  jwksUri: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000,
  rateLimit: true,
  jwksRequestsPerMinute: 5,
})

const validIssuers = [
  `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`,
  `https://sts.windows.net/${process.env.AZURE_TENANT_ID}/`,
]

const getBearerToken = (authorization = '') => {
  const [scheme, token] = authorization.split(' ')
  if (scheme !== 'Bearer' || !token) {
    throw new Error('Missing bearer token')
  }
  return token
}

const getSigningKey = (header, callback) => {
  jwksClient.getSigningKey(header.kid, (error, key) => {
    if (error) return callback(error)
    return callback(null, key.getPublicKey())
  })
}

const verifyJwt = (token) =>
  new Promise((resolve, reject) => {
    // Decode header first to check kid before full verification
    const decoded = jwt.decode(token, { complete: true })
    if (!decoded) return reject(new Error('Invalid token structure'))

    jwt.verify(
      token,
      getSigningKey,
      {
        algorithms: ['RS256'],
        audience: [
          process.env.AZURE_CLIENT_ID,
          `api://${process.env.AZURE_CLIENT_ID}`,
        ],
        issuer: validIssuers,
      },
      (error, payload) => {
        if (error || !payload) {
          return reject(error || new Error('Invalid token'))
        }
        return resolve(payload)
      }
    )
  })

const verifyAccessToken = async (authorization) => {
  const token = getBearerToken(authorization)
  return verifyJwt(token)
}

const validateToken = async (req, res, next) => {
  try {
    req.entraUser = await verifyAccessToken(req.headers.authorization)
    return next()
  } catch (error) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    })
  }
}

module.exports = validateToken
module.exports.verifyAccessToken = verifyAccessToken