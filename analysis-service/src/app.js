require('dotenv').config()

const express = require('express')
const cors = require('cors')
const morgan = require('morgan')

const internalRoutes = require('./routes/internal')
const reportsRoutes = require('./routes/reports')

const app = express()

app.use(cors())
app.use(morgan('dev'))
app.use(express.json({ limit: '2mb' }))

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'analysis-service',
    timestamp: new Date().toISOString(),
  })
})

app.use('/internal', internalRoutes.router)
app.use('/reports', reportsRoutes)

app.use((err, req, res, next) => {
  console.error('[analysis-service] Error:', err.message)
  res.status(err.status || 500).json({
    error: err.code || 'InternalError',
    message: err.message || 'An unexpected error occurred',
  })
})

module.exports = app
