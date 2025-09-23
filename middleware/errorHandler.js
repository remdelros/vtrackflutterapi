const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error
  let error = {
    message: err.message || 'Internal Server Error',
    status: err.status || 500
  };

  // MySQL errors
  if (err.code) {
    switch (err.code) {
      case 'ER_DUP_ENTRY':
        error.message = 'Duplicate entry. Record already exists.';
        error.status = 409;
        break;
      case 'ER_NO_REFERENCED_ROW_2':
        error.message = 'Referenced record does not exist.';
        error.status = 400;
        break;
      case 'ER_ROW_IS_REFERENCED_2':
        error.message = 'Cannot delete record. It is referenced by other records.';
        error.status = 400;
        break;
      case 'ECONNREFUSED':
        error.message = 'Database connection failed.';
        error.status = 503;
        break;
    }
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    error.message = Object.values(err.errors).map(val => val.message).join(', ');
    error.status = 400;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token.';
    error.status = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired.';
    error.status = 401;
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    error.message = 'File too large.';
    error.status = 400;
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    error.message = 'Too many files.';
    error.status = 400;
  }

  res.status(error.status).json({
    success: false,
    error: error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
