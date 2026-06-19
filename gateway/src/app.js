const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
const { createProxyMiddleware } = require('http-proxy-middleware')
const { v4: uuidv4 } = require('uuid')
const authRouter = require('./routes/auth')
const validateToken = require('./middleware/validateToken')
const extractHeaders = require('./middleware/extractHeaders')
const requireRole = require('./middleware/checkRole')
const logger = require('./utils/logger')

const app = express()

const jsonParser = express.json()

const errorResponse = (error, message) => ({ error, message })

const createLimiter = (max, message) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json(errorResponse('TooManyRequests', message))
    },
  })

const generalLimiter = createLimiter(100, 'Too many requests, please try again later.')
const authLimiter = createLimiter(30, 'Too many auth attempts, please try again later.')
const webhookLimiter = createLimiter(500, 'Too many webhook requests, please try again later.')

const addRequestId = (proxyReq, req) => {
  const requestId = req.headers['x-request-id'] || uuidv4()
  req.headers['x-request-id'] = requestId
  proxyReq.setHeader('x-request-id', requestId)
}

const writeRawBody = (proxyReq, req) => {
  if (!Buffer.isBuffer(req.body)) {
    return
  }

  proxyReq.setHeader('content-length', req.body.length)
  proxyReq.write(req.body)
}

const createProxy = (target, options = {}) =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
    proxyTimeout: options.proxyTimeout || 60000,
    timeout: options.timeout || 60000,
    pathRewrite: options.pathRewrite || { '^/api': '' },
    onProxyReq: (proxyReq, req) => {
      addRequestId(proxyReq, req)
      if (options.forwardRawBody) {
        writeRawBody(proxyReq, req)
      }
    },
    onError: (err, req, res) => {
      logger.error(`Proxy error to ${target}: ${err.message}`)
      if (!res.headersSent) {
        res.status(503).json(errorResponse('ServiceUnavailable', 'Downstream service unreachable'))
      }
    },
  })

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(helmet())
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
)
app.use(morgan('combined'))
app.use((req, res, next) => {
  if (req.path.startsWith('/api/webhook/')) {
    return next()
  }

  return jsonParser(req, res, next)
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'gateway', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authLimiter, authRouter)

app.post(
  '/api/webhook/:projectId',
  webhookLimiter,
  express.raw({ type: '*/*' }),
  createProxy(process.env.WATCHER_SERVICE_URL, {
    pathRewrite: { '^/api': '' },
    forwardRawBody: true,
  })
)

app.get(
  '/api/notify/decide',
  generalLimiter,
  createProxy(process.env.NOTIFICATION_SERVICE_URL)
)

app.use(generalLimiter)
app.use(validateToken)
app.use(extractHeaders)

app.use('/api/projects', createProxy(process.env.PROJECT_SERVICE_URL))
app.use('/api/events', createProxy(process.env.WATCHER_SERVICE_URL))
app.use('/api/reports', createProxy(process.env.ANALYSIS_SERVICE_URL))
app.use('/api/notify', requireRole('Admin'), createProxy(process.env.NOTIFICATION_SERVICE_URL))

app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`)
  res.status(err.status || 500).json({
    error: err.code || 'InternalError',
    message: err.message || 'An unexpected error occurred',
  })
})

module.exports = app
