import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

/**
 * Stable, machine-readable error codes. Clients switch on these, never on
 * the human-readable message.
 */
export const ErrorCode = {
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNPROCESSABLE: "UNPROCESSABLE",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  RATE_LIMITED: "RATE_LIMITED",
  UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  INTERNAL: "INTERNAL",
} as const;

/**
 * Codes and messages for the 4xx responses Fastify raises itself, before any
 * route handler runs. Without these the generic fallback would report a
 * client mistake as an internal error.
 */
const CLIENT_ERROR_CODES: Record<number, ErrorCodeValue> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  405: ErrorCode.BAD_REQUEST,
  406: ErrorCode.BAD_REQUEST,
  409: ErrorCode.CONFLICT,
  413: ErrorCode.PAYLOAD_TOO_LARGE,
  415: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
  422: ErrorCode.UNPROCESSABLE,
};

const CLIENT_ERROR_MESSAGES: Record<number, string> = {
  400: "The request could not be understood",
  401: "Authentication is required",
  403: "You do not have access to this resource",
  404: "The requested resource was not found",
  405: "That method is not allowed on this route",
  406: "The requested representation is not available",
  409: "The request conflicts with the current state",
  413: "The request body is too large",
  415: "That content type is not supported",
  422: "The request could not be processed",
};

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorDetail {
  field?: string;
  message: string;
}

/** Base class for every error the API deliberately returns to a client. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCodeValue;
  readonly details?: ErrorDetail[];
  /** When true the message is safe to show to an end user verbatim. */
  readonly expose: boolean;

  constructor(
    statusCode: number,
    code: ErrorCodeValue,
    message: string,
    options: { details?: ErrorDetail[]; expose?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
    this.expose = options.expose ?? statusCode < 500;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: ErrorDetail[]) {
    super(400, ErrorCode.BAD_REQUEST, message, { details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, ErrorCode.UNAUTHORIZED, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super(403, ErrorCode.FORBIDDEN, message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(404, ErrorCode.NOT_FOUND, `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists", details?: ErrorDetail[]) {
    super(409, ErrorCode.CONFLICT, message, { details });
  }
}

export class UnprocessableError extends AppError {
  constructor(message: string, details?: ErrorDetail[]) {
    super(422, ErrorCode.UNPROCESSABLE, message, { details });
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many requests") {
    super(429, ErrorCode.RATE_LIMITED, message);
  }
}

/**
 * A route that exists and is reachable but whose implementation is still
 * pending. Kept distinct from 500 so monitoring can tell scaffolding apart
 * from real failures.
 */
export class NotImplementedError extends AppError {
  constructor(message = "This endpoint is not implemented yet") {
    // Safe to surface: it describes missing scaffolding, not an internal fault.
    super(501, ErrorCode.NOT_IMPLEMENTED, message, { expose: true });
  }
}

export class UpstreamUnavailableError extends AppError {
  constructor(service: string, cause?: unknown) {
    super(503, ErrorCode.UPSTREAM_UNAVAILABLE, `${service} is unavailable`, {
      cause,
    });
  }
}

export interface ErrorResponseBody {
  error: {
    code: ErrorCodeValue;
    message: string;
    details?: ErrorDetail[];
    requestId: string;
  };
}

function zodToDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || undefined,
    message: issue.message,
  }));
}

/**
 * Single place where any thrown value becomes an HTTP response.
 * Unknown errors are logged in full and reported as a generic 500 so internal
 * details never leak to clients.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    const body: ErrorResponseBody = {
      error: {
        code: ErrorCode.NOT_FOUND,
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id,
      },
    };
    reply.status(404).send(body);
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error }, "request failed");
      } else {
        request.log.info({ err: error, code: error.code }, "request rejected");
      }

      const body: ErrorResponseBody = {
        error: {
          code: error.code,
          message: error.expose ? error.message : "Internal server error",
          details: error.details,
          requestId: request.id,
        },
      };
      reply.status(error.statusCode).send(body);
      return;
    }

    if (error instanceof ZodError) {
      const body: ErrorResponseBody = {
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: "Request validation failed",
          details: zodToDetails(error),
          requestId: request.id,
        },
      };
      reply.status(400).send(body);
      return;
    }

    const fastifyError = error as {
      statusCode?: number;
      validation?: { instancePath?: string; message?: string }[];
    };

    // Fastify's own schema validation errors carry a `validation` array.
    if (fastifyError.validation) {
      const body: ErrorResponseBody = {
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: "Request validation failed",
          details: fastifyError.validation.map((issue) => ({
            field: issue.instancePath?.replace(/^\//, "") || undefined,
            message: issue.message ?? "Invalid value",
          })),
          requestId: request.id,
        },
      };
      reply.status(400).send(body);
      return;
    }

    if (fastifyError.statusCode === 429) {
      const body: ErrorResponseBody = {
        error: {
          code: ErrorCode.RATE_LIMITED,
          message: "Too many requests",
          requestId: request.id,
        },
      };
      reply.status(429).send(body);
      return;
    }

    const status =
      fastifyError.statusCode && fastifyError.statusCode >= 400
        ? fastifyError.statusCode
        : 500;

    // Fastify raises its own 4xx before any handler runs — an oversized body,
    // malformed JSON, an unsupported media type. These are the client's
    // fault and safe to name: reporting them as "Internal server error"
    // sends the caller looking for a bug that is not there.
    if (status < 500) {
      const body: ErrorResponseBody = {
        error: {
          code: CLIENT_ERROR_CODES[status] ?? ErrorCode.BAD_REQUEST,
          message: CLIENT_ERROR_MESSAGES[status] ?? "Request could not be processed",
          requestId: request.id,
        },
      };
      request.log.info({ err: error, statusCode: status }, "client error");
      reply.status(status).send(body);
      return;
    }

    request.log.error({ err: error }, "unhandled error");
    const body: ErrorResponseBody = {
      error: {
        code: ErrorCode.INTERNAL,
        message: "Internal server error",
        requestId: request.id,
      },
    };
    reply.status(status).send(body);
  });
}
