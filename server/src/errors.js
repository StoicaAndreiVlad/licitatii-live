// Erori de domeniu cu cod stabil și status HTTP; formatul răspunsului este unic:
// { "error": { "code": "...", "message": "...", "details": { ... } } }

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (message = "Resursa nu a fost găsită.") => new AppError(404, "NOT_FOUND", message);

export function sendError(res, status, code, message, details) {
  const body = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return res.status(status).json(body);
}

export function createErrorHandler({ logger = console } = {}) {
  // Express recunoaște middleware-ul de erori după cei 4 parametri.
  return function errorHandler(error, _req, res, next) {
    if (res.headersSent) return next(error);
    if (error instanceof AppError) {
      return sendError(res, error.status, error.code, error.message, error.details);
    }
    if (error?.type === "entity.parse.failed") {
      return sendError(res, 400, "INVALID_JSON", "Corpul cererii nu este JSON valid.");
    }
    if (error?.type === "entity.too.large") {
      return sendError(res, 413, "PAYLOAD_TOO_LARGE", "Corpul cererii este prea mare.");
    }
    // Detaliile tehnice rămân doar în jurnalul serverului, fără corpul cererii.
    logger.error?.(error);
    return sendError(res, 500, "INTERNAL_ERROR", "A apărut o eroare internă. Încercați din nou.");
  };
}
