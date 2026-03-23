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
  destination?: DestinationStream;
} = {}): Logger {
  return pino({
    base: null,
  }, options.destination ?? getDefaultDestination());
}

let appLogger = createLogger();

export function getAppLogger() {
  return appLogger;
}

export function setLoggerDestinationForTests(destination?: DestinationStream) {
  appLogger = destination ? createLogger({ destination }) : createLogger();
}

export function logEvent(
  logger: Logger,
  scope: string,
  event: string,
  details: Record<string, unknown> = {},
) : void {
  const sanitizedDetails = sanitizeLogValue(details);

  if (!isRecord(sanitizedDetails)) {
    logger.info({ event, scope }, event);
    return;
  }

  logger.info({
    ...sanitizedDetails,
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
