require('dotenv').config()
const app = require('./app')
const logger = require('./utils/logger')

const port = process.env.GATEWAY_PORT

const server = app.listen(port, () => {
  logger.info(`Running on port ${port}`)
  logger.info(`Environment: ${process.env.NODE_ENV}`)
})

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully')
  server.close(() => {
    logger.info('HTTP server closed')
    process.exit(0)
  })
})
