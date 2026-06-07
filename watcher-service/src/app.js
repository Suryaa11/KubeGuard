require('dotenv').config()

const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const mongoose = require('mongoose')

const webhookRoutes = require('./routes/webhook')
const eventRoutes = require('./routes/events')
const internalRoutes = require('./routes/internal')

const app = express()

app.use(cors())
app.use(morgan('dev'))
app.use('/webhook', webhookRoutes)
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'watcher-service', timestamp: new Date().toISOString() })
})

app.use('/internal', internalRoutes)
app.use('/events', eventRoutes)

app.use((err, req, res, next) => {
  console.error('[watcher-service] Error:', err.message)
  res.status(err.status || 500).json({
    error: err.code || 'InternalError',
    message: err.message || 'An unexpected error occurred',
  })
})

module.exports = app
