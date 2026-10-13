import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import pino from "pino";

export const logger = pino({
  level: process.env.NODE_ENV === "test" ? "silent" : "info",
  redact: [
    "password",
    "token",
    "fields",
    "headers.authorization",
    "headers.cookie",
  ],
});
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const missing = () =>
  new AppError(404, "NOT_FOUND", "This resource could not be found.");
export function objectId(value) {
  if (!mongoose.isObjectIdOrHexString(value)) throw missing();
  return value;
}
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError(
      400,
      "INVALID_INPUT",
      "Check the highlighted fields.",
      result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    );
  return result.data;
}
export function requestContext(req, res, next) {
  req.requestId = randomUUID();
  res.set("X-Request-Id", req.requestId);
  next();
}
export function errorHandler(err, req, res, _next) {
  let status = err.status || 500,
    code = err.code || "INTERNAL_ERROR",
    message = err.message;
  if (err.code === 11000) {
    status = 409;
    code = "DUPLICATE";
    message = "This record already exists.";
  }
  if (err.name === "VersionError") {
    status = 409;
    code = "CONFLICT";
    message = "Someone updated this record. Reload and try again.";
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    status = 413;
    code = "FILE_TOO_LARGE";
    message = "Choose a file smaller than 10 MB.";
  }
  if (err.name === "CastError") {
    status = 404;
    code = "NOT_FOUND";
    message = "This resource could not be found.";
  }
  if (["MongoNetworkError", "MongoServerSelectionError"].includes(err.name)) {
    status = 503;
    code = "DATABASE_UNAVAILABLE";
    message = "The service is temporarily unavailable. Please try again.";
  }
  if (status >= 500) {
    logger.error({ requestId: req.requestId, code }, "Request failed");
    if (status === 500) message = "Something went wrong. Please try again.";
  }
  res.status(status).json({
    error: {
      code,
      message,
      requestId: req.requestId,
      ...(err.details ? { details: err.details } : {}),
    },
  });
}
