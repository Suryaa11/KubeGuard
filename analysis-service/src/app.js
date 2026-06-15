const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
const mongoose = require('mongoose')

const internalRoutes = require('./routes/internal')
const reportsRoutes = require('./routes/reports')
const logger = require('./utils/logger')

const app = express()

app.use(helmet())
app.use(cors())
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
)
app.use(morgan('dev'))
app.use(express.json({ limit: '2mb' }))

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'analysis-service',
    timestamp: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  })
})

app.use('/internal', internalRoutes)
app.use('/reports', reportsRoutes)

app.use((req, res) => {
  res.status(404).json({
    error: 'NotFound',
    message: 'Route not found',
  })
})

app.use((err, req, res, next) => {
  logger.error(err.message)

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
    details: err.details,
  })
})

module.exports = app
