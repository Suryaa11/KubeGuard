class AppError extends Error {
  constructor(code, message, status = 500, details) {
    super(message)
    this.code = code
    this.status = status
    this.details = details
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad request', details) {
    super('BadRequest', message, 400, details)
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super('Unauthorized', message, 401)
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super('Forbidden', message, 403)
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NotFound', message, 404)
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
}
