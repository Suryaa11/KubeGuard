const serviceName = 'gateway'

const write = (level, message, extra) => {
  if (extra) {
    console[level](`[${serviceName}] ${message}`, extra)
    return
  }

  console[level](`[${serviceName}] ${message}`)
}

module.exports = {
  info: (message, extra) => write('log', message, extra),
  warn: (message, extra) => write('warn', message, extra),
  error: (message, extra) => write('error', message, extra),
}
