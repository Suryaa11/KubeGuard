const serviceName = process.env.SERVICE_NAME || 'watcher-service'

function log(level, message, meta) {
  const payload = meta ? ` ${JSON.stringify(meta)}` : ''
  console[level](`[${serviceName}] ${message}${payload}`)
}

module.exports = {
  info: (message, meta) => log('log', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
}
