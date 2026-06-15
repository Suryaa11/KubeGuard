require('dotenv').config()
const mongoose = require('mongoose')
const app = require('./app')
const logger = require('./utils/logger')

const PORT = process.env.PROJECT_PORT || 3001
const MONGODB_URI = process.env.MONGODB_URI
const required = [
  'MONGODB_URI',
  'INTERNAL_SECRET',
  'ENCRYPTION_KEY',
  'GITHUB_TOKEN',
  'GATEWAY_PUBLIC_URL',
]

required.forEach((key) => {
  if (!process.env[key]) {
    logger.error(`FATAL: missing env var ${key}`)
    process.exit(1)
  }
})

if (process.env.ENCRYPTION_KEY.length !== 32) {
  logger.error('FATAL: ENCRYPTION_KEY must be exactly 32 characters')
  process.exit(1)
}

mongoose.connection.on('connected', () => logger.info('MongoDB connection established'))
mongoose.connection.on('disconnected', () => logger.warn('MongoDB connection disconnected'))
mongoose.connection.on('reconnected', () => logger.info('MongoDB connection re-established'))
mongoose.connection.on('error', (error) => logger.error(`MongoDB connection error: ${error.message}`))

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    const server = app.listen(PORT, () => {
      logger.info(`Running on port ${PORT}`)
    })

    const shutdown = (signal) => {
      logger.info(`${signal} received, shutting down gracefully`)
      server.close(async () => {
        await mongoose.connection.close(false)
        process.exit(0)
      })
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  })
  .catch((error) => {
    logger.error(`MongoDB connection failed: ${error.message}`)
    process.exit(1)
  })
