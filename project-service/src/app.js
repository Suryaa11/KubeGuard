const express = require('express')
const morgan = require('morgan')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const mongoose = require('mongoose')
const projectRoutes = require('./routes/projects')
const internalRoutes = require('./routes/internal')
const logger = require('./utils/logger')

const app = express()

app.use(helmet())
app.use(cors())
app.use(morgan('dev'))
app.use(express.json())
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
)

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'project-service',
    timestamp: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  })
})

app.use('/internal', internalRoutes)
app.use('/projects', projectRoutes)

app.use((req, res) => {
  res.status(404).json({ error: 'NotFound', message: 'Route not found.' })
})

app.use((err, req, res, next) => {
  logger.error(err.message)

  if (err.name === 'CastError') {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Invalid resource identifier.',
      details: { id: 'Must be a valid MongoDB ObjectId.' },
    })
  }

  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors || {}).reduce((acc, item) => {
      acc[item.path] = item.message
      return acc
    }, {})
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Request validation failed',
      details,
    })
  }

  if (err.code === 11000) {
    return res.status(409).json({
      error: 'DuplicateProject',
      message: 'This repository, branch, and folder combination is already being monitored.',
    })
  }

  return res.status(err.status || 500).json({
    error: err.code || 'InternalError',
    message: err.message || 'An unexpected error occurred',
    details: err.details || {},
  })
})

module.exports = app
