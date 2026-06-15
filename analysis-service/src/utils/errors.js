class AppError extends Error {
  constructor(message, status = 500, code = 'InternalError', details = undefined) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NotFound')
  }
}

class ValidationAppError extends AppError {
  constructor(message = 'Request validation failed', details = undefined) {
    super(message, 400, 'ValidationError', details)
  }
}

module.exports = { AppError, NotFoundError, ValidationAppError }
