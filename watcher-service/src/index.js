require('dotenv').config()
const mongoose = require('mongoose')
const app = require('./app')

const PORT = process.env.WATCHER_PORT || 3002
const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('[watcher-service] MONGODB_URI is required')
  process.exit(1)
}

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('[watcher-service] Connected to MongoDB')
    app.listen(PORT, () => console.log(`[watcher-service] Running on port ${PORT}`))
  })
  .catch((error) => {
    console.error('[watcher-service] MongoDB connection failed:', error.message)
    process.exit(1)
  })

process.on('SIGTERM', async () => {
  await mongoose.connection.close()
  process.exit(0)
})
