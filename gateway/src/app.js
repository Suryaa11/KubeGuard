require('dotenv').config()

const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const morgan = require('morgan')
const authRoute = require('./routes/authRoute')
const proxyRoutes = require('./routes/proxyRoutes')
const { authLimiter: authRateLimiter } = require('./middleware/rateLimits')

const app = express()

app.disable('x-powered-by')
app.use(helmet())
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
)
app.use(morgan('combined'))

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'gateway', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authRateLimiter, authRoute)
app.use(proxyRoutes)

app.use((err, req, res, next) => {
  console.error(`[gateway] Unhandled error:`, err.message)
  res.status(err.status || 500).json({
    error: err.code || 'InternalError',
    message: err.message || 'An unexpected error occurred',
  })
})

module.exports = app
