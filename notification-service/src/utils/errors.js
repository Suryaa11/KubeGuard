class AppError extends Error {
  constructor(message, status = 500, code = 'InternalError', details = undefined) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

class ConflictError extends AppError {
  constructor(message = 'Decision already recorded') {
    super(message, 409, 'ConflictError')
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'Unauthorized')
  }
}

class ValidationAppError extends AppError {
  constructor(message = 'Request validation failed', details = undefined) {
    super(message, 400, 'ValidationError', details)
  }
}

module.exports = { AppError, ConflictError, UnauthorizedError, ValidationAppError }
