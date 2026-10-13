export function notFound(req, res) {
  res.status(404).json({ error: 'Route not found' });
}

export function errorHandler(err, req, res, next) {
  console.error(err);
  if (res.headersSent) return next(err);
  const status = Number(err.status) || 500;
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message
  });
}
