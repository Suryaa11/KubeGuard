const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
const mongoose = require('mongoose')

const webhookRoutes = require('./routes/webhook')
const eventRoutes = require('./routes/events')
const internalRoutes = require('./routes/internal')
const { NotFoundError } = require('./utils/errors')
const logger = require('./utils/logger')

const app = express()

app.use(helmet())
app.use(cors())
app.use(morgan('dev'))
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  })
)

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'watcher-service',
    timestamp: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  })
})

app.use('/webhook', webhookRoutes)
app.use(express.json())
app.use('/events', eventRoutes)
app.use('/internal', internalRoutes)

app.use((req, res, next) => {
  next(new NotFoundError('Route not found'))
})

app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`)

  if (err.isJoi) {
    const details = err.details.reduce((acc, detail) => {
      acc[detail.context.key] = detail.message
      return acc
    }, {})

    return res.status(400).json({
      error: 'ValidationError',
      message: 'Request validation failed',
      details,
    })
  }

  return res.status(err.status || 500).json({
    error: err.code || 'InternalError',
    message: err.message || 'An unexpected error occurred',
    ...(err.details ? { details: err.details } : {}),
  })
})

module.exports = app
