export function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  if (err.name === 'UnauthorizedError' || err.status === 401) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: err.message || 'Authentication required'
    });
  }

  if (err.name === 'ForbiddenError' || err.status === 403) {
    return res.status(403).json({
      error: 'Forbidden',
      message: err.message || 'Access denied'
    });
  }

  if (err.name === 'NotFoundError' || err.status === 404) {
    return res.status(404).json({
      error: 'Not Found',
      message: err.message || 'Resource not found'
    });
  }

  if (err.name === 'ValidationError' || err.status === 400) {
    return res.status(400).json({
      error: 'Bad Request',
      message: err.message || 'Invalid request'
    });
  }

  // Default to 500 internal server error
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development'
      ? err.message
      : 'An unexpected error occurred'
  });
}

export class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request') {
    super(message, 400);
    this.name = 'ValidationError';
  }
}
