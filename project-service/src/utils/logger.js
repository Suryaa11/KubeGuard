const format = (level, message) => `[project-service] ${level}: ${message}`

module.exports = {
  info: (message) => console.log(format('INFO', message)),
  warn: (message) => console.warn(format('WARN', message)),
  error: (message) => console.error(format('ERROR', message)),
}
