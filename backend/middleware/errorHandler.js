export function notFoundHandler(_req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That endpoint does not exist.' } });
}

export function errorHandler(error, _req, res, _next) {
  if (res.headersSent) {
    res.destroy(error);
    return;
  }

  const status = Number.isInteger(error.status) ? error.status : 500;
  const message = status >= 500 ? 'The server could not complete this request.' : error.message;
  if (status >= 500) console.error(`[server] ${error.message}`);
  res.status(status).json({
    error: {
      code: error.code ?? (error.type === 'entity.parse.failed' ? 'INVALID_JSON' : 'INTERNAL_ERROR'),
      message,
    },
  });
}
