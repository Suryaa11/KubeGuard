require('dotenv').config()

const mongoose = require('mongoose')
const app = require('./app')
const logger = require('./utils/logger')

const PORT = process.env.WATCHER_PORT || 3002
const REQUIRED_ENV_VARS = ['MONGODB_URI', 'INTERNAL_SECRET', 'PROJECT_SERVICE_URL', 'ANALYSIS_SERVICE_URL']

for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    logger.error(`${envVar} is required`)
    process.exit(1)
  }
}

let server

async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    logger.info('Connected to MongoDB')

    server = app.listen(PORT, () => {
      logger.info(`watcher-service running on port ${PORT}`)
    })
  } catch (error) {
    logger.error(`Startup failed: ${error.message}`)
    process.exit(1)
  }
}

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down`)
  if (server) {
    server.close(async () => {
      await mongoose.connection.close()
      process.exit(0)
    })
    return
  }

  await mongoose.connection.close()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

start()
