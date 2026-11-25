export function errorHandler(err, req, res, next) {
  console.error('Unhandled Application Error:', err);

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  return res.status(status).json({
    error: message,
    code: err.code || 'INTERNAL_ERROR',
  });
}
