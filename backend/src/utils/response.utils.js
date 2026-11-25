export function sendSuccess(res, data = {}, status = 200) {
  return res.status(status).json(data);
}

export function sendError(res, message, status = 400, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}
