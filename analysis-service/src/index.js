require('dotenv').config()

const mongoose = require('mongoose')
const app = require('./app')
const { closeConnection } = require('./services/serviceBus')

const PORT = process.env.ANALYSIS_PORT || 3003
const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('[analysis-service] MONGODB_URI is required')
  process.exit(1)
}

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('[analysis-service] Connected to MongoDB')
    app.listen(PORT, () => {
      console.log(`[analysis-service] Running on port ${PORT}`)
    })
  })
  .catch((error) => {
    console.error('[analysis-service] MongoDB connection failed:', error.message)
    process.exit(1)
  })

process.on('SIGTERM', async () => {
  console.log('[analysis-service] SIGTERM received, closing connections...')
  await Promise.allSettled([mongoose.connection.close(), closeConnection()])
  process.exit(0)
})
