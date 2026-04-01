import { getAppLogger, logEvent } from "./logger.js";
export function logHttpServerStarted(url, logger = getAppLogger()) {
    logEvent(logger, "startup", "server.started", {
        transport: "http",
        url,
    });
}
export function logStdioServerStarted(logger = getAppLogger()) {
    logEvent(logger, "startup", "server.started", {
        transport: "stdio",
    });
}
export function logStartupFailure(error, logger = getAppLogger()) {
    logEvent(logger, "startup", "startup.failed", {
        error,
    });
}
export function logAuthConfigLoaded(details, logger = getAppLogger()) {
    logEvent(logger, "startup", "auth.config.loaded", details);
}
