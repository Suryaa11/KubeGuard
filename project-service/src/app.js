require('dotenv').config()

const express = require('express')
const morgan = require('morgan')
const cors = require('cors')
const mongoose = require('mongoose')

const projectRoutes = require('./routes/projects')
const internalRoutes = require('./routes/internal')

const app = express()

app.use(cors())
app.use(morgan('dev'))
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'project-service',
    timestamp: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  })
})

app.use('/internal', internalRoutes)
app.use('/', projectRoutes)

app.use((err, req, res, next) => {
  console.error('[project-service] Error:', err.message)
  if (err.code === 11000) {
    return res.status(409).json({
      error: 'DuplicateProject',
      message: 'This repository, branch, and folder combination is already being monitored.',
    })
  }
  res.status(err.status || 500).json({
    error: err.code || 'InternalError',
    message: err.message || 'An unexpected error occurred',
  })
})

module.exports = app
