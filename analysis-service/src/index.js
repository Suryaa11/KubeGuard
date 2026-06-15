require('dotenv').config()

const mongoose = require('mongoose')
const app = require('./app')
const { closeConnection } = require('./services/serviceBus')
const logger = require('./utils/logger')

const PORT = process.env.ANALYSIS_PORT || 3003

const REQUIRED_ENV = [
  'MONGODB_URI',
  'INTERNAL_SECRET',
  'AI_API_URL',
  'AI_API_KEY',
  'AI_MODEL',
  'AZURE_STORAGE_CONNECTION_STRING',
  'AZURE_STORAGE_CONTAINER',
  'SERVICE_BUS_CONNECTION_STRING',
  'SERVICE_BUS_QUEUE',
  'PROJECT_SERVICE_URL',
  'WATCHER_SERVICE_URL',
]

function validateEnvironment() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key])
  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`)
    process.exit(1)
  }
}

async function start() {
  validateEnvironment()

  mongoose.connection.on('error', (error) => {
    logger.error(`MongoDB connection error: ${error.message}`)
  })

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected')
  })

  try {
    await mongoose.connect(process.env.MONGODB_URI)
    logger.info('Connected to MongoDB')

    const server = app.listen(PORT, () => {
      logger.info(`Running on port ${PORT}`)
    })

    const shutdown = async (signal) => {
      logger.info(`${signal} received, closing connections`)
      server.close(async () => {
        await Promise.allSettled([mongoose.connection.close(), closeConnection()])
        process.exit(0)
      })
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  } catch (error) {
    logger.error(`Startup failed: ${error.message}`)
    process.exit(1)
  }
}

start()
