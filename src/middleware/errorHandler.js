import { ZodError } from "zod";
import mongoose from "mongoose";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";
import { isProd } from "../config/env.js";

// Central error handler - every error funnels through here
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  let statusCode = 500;
  let message = "Serverda xatolik yuz berdi";
  let code;
  let details;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = "Ma'lumotlar noto'g'ri";
    code = "VALIDATION_ERROR";
    details = err.errors.map((e) => ({ path: e.path.join("."), message: e.message }));
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = "Ma'lumotlar noto'g'ri";
    code = "VALIDATION_ERROR";
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = "Noto'g'ri ID";
    code = "BAD_OBJECT_ID";
  } else if (err?.code === 11000) {
    statusCode = 409;
    message = "Bunday yozuv allaqachon mavjud";
    code = "DUPLICATE";
    details = err.keyValue;
  }

  if (statusCode >= 500) logger.error({ err, url: req.originalUrl }, "Unhandled error");

  res.status(statusCode).json({
    success: false,
    message,
    ...(code && { code }),
    ...(details && { details }),
    ...(!isProd && err.stack && statusCode >= 500 && { stack: err.stack }),
  });
};

export default errorHandler;
