import type { LoggerOptions } from "pino";

/**
 * Fields that must never reach the logs. Pino replaces each with `[Redacted]`.
 * Medical notes and identity documents are sensitive under the platform's
 * privacy rules, so anything carrying them is redacted too.
 */
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-refresh-token']",
  "res.headers['set-cookie']",
  "*.password",
  "*.passwordHash",
  "*.refreshToken",
  "*.accessToken",
  "*.otp",
  "*.otpHash",
  "*.token",
  "*.documentNumber",
  "*.medicalNotes",
];

export interface BuildLoggerOptions {
  serviceName: string;
  level: string;
  pretty: boolean;
}

export function buildLoggerOptions({
  serviceName,
  level,
  pretty,
}: BuildLoggerOptions): LoggerOptions {
  return {
    level,
    base: { service: serviceName },
    redact: { paths: REDACT_PATHS, censor: "[Redacted]" },
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    serializers: {
      req(request: {
        id: string;
        method: string;
        url: string;
        headers: Record<string, string | string[] | undefined>;
      }) {
        return {
          id: request.id,
          method: request.method,
          url: request.url,
          // Correlation id propagated from the gateway across services.
          traceId: request.headers["x-trace-id"],
        };
      },
      res(reply: { statusCode: number }) {
        return { statusCode: reply.statusCode };
      },
    },
    ...(pretty
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss.l",
              ignore: "pid,hostname",
            },
          },
        }
      : {}),
  };
}
