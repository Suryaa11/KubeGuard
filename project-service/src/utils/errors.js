class AppError extends Error {
  constructor(message, status, code, details = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'Forbidden')
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found.') {
    super(message, 404, 'NotFound')
  }
}

module.exports = {
  AppError,
  ForbiddenError,
  NotFoundError,
}
