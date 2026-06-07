require('dotenv').config()
const app = require('./app')

const PORT = process.env.GATEWAY_PORT || 3000
app.listen(PORT, () => {
  console.log(`[gateway] Running on port ${PORT}`)
  console.log(`[gateway] Environment: ${process.env.NODE_ENV}`)
  console.log(`[gateway] Frontend allowed: ${process.env.FRONTEND_URL}`)
})

process.on('SIGTERM', () => {
  console.log('[gateway] SIGTERM received, shutting down gracefully')
  process.exit(0)
})
