import type { Logger } from "pino";

import { getAppLogger, logEvent } from "./logger.js";

export function logHttpServerStarted(url: string, logger: Logger = getAppLogger()) {
  logEvent(logger, "startup", "server.started", {
    transport: "http",
    url,
  });
}

export function logStdioServerStarted(logger: Logger = getAppLogger()) {
  logEvent(logger, "startup", "server.started", {
    transport: "stdio",
  });
}

export function logStartupFailure(error: unknown, logger: Logger = getAppLogger()) {
  logEvent(logger, "startup", "startup.failed", {
    error,
  });
}
