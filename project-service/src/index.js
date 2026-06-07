require('dotenv').config()
const mongoose = require('mongoose')
const app = require('./app')

const PORT = process.env.PROJECT_PORT || 3001
const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('[project-service] MONGODB_URI is required')
  process.exit(1)
}

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('[project-service] Connected to MongoDB')
    app.listen(PORT, () => {
      console.log(`[project-service] Running on port ${PORT}`)
    })
  })
  .catch((error) => {
    console.error('[project-service] MongoDB connection failed:', error.message)
    process.exit(1)
  })

process.on('SIGTERM', async () => {
  console.log('[project-service] SIGTERM received, closing MongoDB connection...')
  await mongoose.connection.close()
  process.exit(0)
})
