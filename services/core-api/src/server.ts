import { buildApp } from "./app.js";
import { config } from "./config.js";

/**
 * How long to let in-flight requests finish before exiting anyway. An
 * orchestrator sends SIGTERM and then SIGKILLs after its own grace period
 * (30s on Kubernetes by default), so this must be comfortably shorter or the
 * process dies mid-request with no chance to close the pool.
 */
const SHUTDOWN_GRACE_MS = 15_000;

async function main(): Promise<void> {
  const app = await buildApp();

  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    // A second signal during a drain means someone wants out now.
    if (shuttingDown) {
      app.log.warn({ signal }, "second signal received, exiting immediately");
      process.exit(1);
    }
    shuttingDown = true;
    app.log.info({ signal }, "shutting down");

    // Without this, one hung connection keeps the process alive forever.
    const timer = setTimeout(() => {
      app.log.error(
        { graceMs: SHUTDOWN_GRACE_MS },
        "graceful shutdown timed out, forcing exit",
      );
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    // Do not let the timer itself hold the event loop open.
    timer.unref();

    void app.close().then(
      () => {
        clearTimeout(timer);
        process.exit(0);
      },
      (error) => {
        app.log.error({ err: error }, "error during shutdown");
        clearTimeout(timer);
        process.exit(1);
      },
    );
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => shutdown(signal));
  }

  // A rejection that reaches here left some state unknown; log it through pino
  // (so redaction applies) and let the orchestrator restart us.
  process.on("unhandledRejection", (reason) => {
    app.log.fatal({ err: reason }, "unhandled rejection");
    shutdown("unhandledRejection");
  });

  process.on("uncaughtException", (error) => {
    app.log.fatal({ err: error }, "uncaught exception");
    shutdown("uncaughtException");
  });

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (error) {
    app.log.error({ err: error }, "failed to start");
    process.exit(1);
  }
}

void main();
