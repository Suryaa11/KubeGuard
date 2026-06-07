const express = require('express')
const { createProxyMiddleware } = require('http-proxy-middleware')
const { generalLimiter, webhookLimiter } = require('../middleware/rateLimits')
const { validateEntraToken } = require('../middleware/validateEntraToken')
const { extractUserHeaders } = require('../middleware/extractUserHeaders')
const { requireRole } = require('../middleware/requireRole')

function makeProxy(target, pathRewrite = { '^/api': '' }, options = {}) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    on: {
      error: (err, req, res) => {
        console.error(`[gateway] Proxy error to ${target}:`, err.message)
        if (!res.headersSent) {
          res.status(503).json({
            error: 'ServiceUnavailable',
            message: 'The requested service is temporarily unavailable.',
          })
        }
      },
      proxyReq: (proxyReq, req) => {
        if (options.forwardRawBody && Buffer.isBuffer(req.body)) {
          proxyReq.setHeader('content-length', Buffer.byteLength(req.body))
          proxyReq.write(req.body)
        }
      },
    },
  })
}

const router = express.Router()

router.all(
  '/api/webhook/:projectId',
  webhookLimiter,
  express.raw({ type: '*/*' }),
  makeProxy(process.env.WATCHER_SERVICE_URL, { '^/api/webhook': '/webhook' }, { forwardRawBody: true })
)

router.post(
  '/api/reports/:id/decide',
  generalLimiter,
  validateEntraToken,
  extractUserHeaders,
  requireRole('Admin'),
  makeProxy(process.env.NOTIFICATION_SERVICE_URL)
)

router.post(
  '/api/notify/decide',
  generalLimiter,
  validateEntraToken,
  extractUserHeaders,
  requireRole('Admin'),
  makeProxy(process.env.NOTIFICATION_SERVICE_URL)
)

router.all('/api/projects*', generalLimiter, validateEntraToken, extractUserHeaders, makeProxy(process.env.PROJECT_SERVICE_URL))
router.all('/api/events*', generalLimiter, validateEntraToken, extractUserHeaders, makeProxy(process.env.WATCHER_SERVICE_URL))
router.all('/api/reports*', generalLimiter, validateEntraToken, extractUserHeaders, makeProxy(process.env.ANALYSIS_SERVICE_URL))
router.all('/api/notify*', generalLimiter, validateEntraToken, extractUserHeaders, makeProxy(process.env.NOTIFICATION_SERVICE_URL))

module.exports = router
