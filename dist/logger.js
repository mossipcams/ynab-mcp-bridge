import pino from "pino";
const REDACTED_VALUE = "[Redacted]";
const SENSITIVE_KEYS = new Set([
    "access_token",
    "access_token_value",
    "api_token",
    "authorization",
    "cf_access_jwt_assertion",
    "client_secret",
    "code_verifier",
    "id_token",
    "refresh_token",
    "token",
    "token_value",
]);
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeKey(key) {
    return key
        .replaceAll("-", "_")
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .toLowerCase();
}
function isSensitiveKey(key) {
    const normalizedKey = normalizeKey(key);
    return SENSITIVE_KEYS.has(normalizedKey) ||
        normalizedKey.endsWith("_secret") ||
        normalizedKey.endsWith("_token");
}
export function sanitizeLogValue(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => sanitizeLogValue(entry));
    }
    if (value instanceof Error) {
        return {
            message: value.message,
            name: value.name,
        };
    }
    if (!isRecord(value)) {
        return value;
    }
    const sanitizedEntries = Object.entries(value).map(([key, entryValue]) => ([key, isSensitiveKey(key) ? REDACTED_VALUE : sanitizeLogValue(entryValue)]));
    return Object.fromEntries(sanitizedEntries);
}
export function createLogger(options = {}) {
    return pino({
        base: undefined,
    }, options.destination ?? process.stderr);
}
let appLogger = createLogger();
export function getAppLogger() {
    return appLogger;
}
export function setLoggerDestinationForTests(destination) {
    appLogger = createLogger({
        destination,
    });
}
export function logEvent(logger, scope, event, details = {}) {
    logger.info({
        ...sanitizeLogValue(details),
        event,
        scope,
    }, event);
}
export function logAppEvent(scope, event, details = {}) {
    logEvent(getAppLogger(), scope, event, details);
}
