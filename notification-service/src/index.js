require('dotenv').config()

const mongoose = require('mongoose')
const app = require('./app')
const { startConsumer, stopConsumer } = require('./services/serviceBusConsumer')
const logger = require('./utils/logger')

const PORT = process.env.NOTIFICATION_PORT || 3004

const REQUIRED_ENV = [
  'MONGODB_URI',
  'INTERNAL_SECRET',
  'NOTIFICATION_SECRET',
  'SERVICE_BUS_CONNECTION_STRING',
  'SERVICE_BUS_QUEUE',
  'ANALYSIS_SERVICE_URL',
  'WATCHER_SERVICE_URL',
  'FRONTEND_URL',
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

    await startConsumer()

    const server = app.listen(PORT, () => {
      logger.info(`Running on port ${PORT}`)
    })

    const shutdown = async (signal) => {
      logger.info(`${signal} received, closing connections`)
      server.close(async () => {
        await Promise.allSettled([stopConsumer(), mongoose.connection.close()])
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
