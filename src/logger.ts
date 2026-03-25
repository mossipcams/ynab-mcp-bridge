import pino, { type DestinationStream, type Logger } from "pino";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKey(key: string) {
  return key
    .replaceAll("-", "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function isSensitiveKey(key: string) {
  const normalizedKey = normalizeKey(key);

  if (normalizedKey.startsWith("has_") || normalizedKey.startsWith("issued_")) {
    return false;
  }

  return SENSITIVE_KEYS.has(normalizedKey) ||
    normalizedKey.endsWith("_secret") ||
    normalizedKey.endsWith("_token");
}

function sanitizeLogValue(value: unknown): unknown {
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

  const sanitizedEntries = Object.entries(value).map(([key, entryValue]) => (
    [key, isSensitiveKey(key) ? REDACTED_VALUE : sanitizeLogValue(entryValue)]
  ));

  return Object.fromEntries(sanitizedEntries);
}

function sanitizeLogObject(value: Record<string, unknown>) {
  const sanitized = sanitizeLogValue(value);

  if (!isRecord(sanitized)) {
    return {};
  }

  return sanitized;
}

function getDefaultDestination(): DestinationStream {
  const destination: DestinationStream = {
    write(chunk: string | Uint8Array) {
      const line = typeof chunk === "string"
        ? chunk.trimEnd()
        : Buffer.from(chunk).toString("utf8").trimEnd();

      console.error(line);
      return true;
    },
  };

  return destination;
}

export function createLogger(options: {
  destination?: DestinationStream | undefined;
} = {}): Logger {
  return pino({}, options.destination ?? getDefaultDestination());
}

let appLogger = createLogger();

export function getAppLogger() {
  return appLogger;
}

export function setLoggerDestinationForTests(destination?: DestinationStream) {
  appLogger = createLogger(destination ? { destination } : {});
}

export function logEvent(
  logger: Logger,
  scope: string,
  event: string,
  details: Record<string, unknown> = {},
) {
  logger.info({
    ...sanitizeLogObject(details),
    event,
    scope,
  }, event);
}

export function logAppEvent(
  scope: string,
  event: string,
  details: Record<string, unknown> = {},
) {
  logEvent(getAppLogger(), scope, event, details);
}
