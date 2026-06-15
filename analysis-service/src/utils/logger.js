const serviceName = process.env.SERVICE_NAME || 'analysis-service'

function write(level, message, meta) {
  const line = `[${serviceName}] ${message}`
  if (meta) {
    console[level](line, meta)
  } else {
    console[level](line)
  }
}

module.exports = {
  info: (message, meta) => write('log', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
}
