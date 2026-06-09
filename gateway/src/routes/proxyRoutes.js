// gateway/src/routes/proxyRoutes.js
// Routes all incoming /api/* requests to the correct downstream microservice.
// Token validation and role checks are applied per route as defined here.

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

// ── GitHub webhook — NO auth, raw body preserved for HMAC verification ────
router.all(
  '/api/webhook/:projectId',
  webhookLimiter,
  express.raw({ type: '*/*' }),
  makeProxy(process.env.WATCHER_SERVICE_URL, { '^/api/webhook': '/webhook' }, { forwardRawBody: true })
)

// ── Email approval link — NO Entra ID auth, uses HMAC-signed token ─────────
// MUST be registered BEFORE the catch-all /api/notify* route below.
// When an admin clicks Approve/Reject in their email, they have no Bearer token.
// The notification service verifies the signed token in the query string instead.
router.get(
  '/api/notify/decide',
  webhookLimiter,
  makeProxy(process.env.NOTIFICATION_SERVICE_URL)
)

// ── Dashboard approve/reject — Admin role required ────────────────────────
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

// ── Standard authenticated routes ─────────────────────────────────────────
router.all(
  '/api/projects*',
  generalLimiter,
  validateEntraToken,
  extractUserHeaders,
  makeProxy(process.env.PROJECT_SERVICE_URL)
)

router.all(
  '/api/events*',
  generalLimiter,
  validateEntraToken,
  extractUserHeaders,
  makeProxy(process.env.WATCHER_SERVICE_URL)
)

router.all(
  '/api/reports*',
  generalLimiter,
  validateEntraToken,
  extractUserHeaders,
  makeProxy(process.env.ANALYSIS_SERVICE_URL)
)

router.all(
  '/api/notify*',
  generalLimiter,
  validateEntraToken,
  extractUserHeaders,
  makeProxy(process.env.NOTIFICATION_SERVICE_URL)
)

module.exports = router