function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getYnabApiErrorMessage(error: unknown): string | undefined {
  if (!isRecord(error) || !isRecord(error["error"])) {
    return undefined;
  }

  const errorRecord = error["error"];
  const detail = errorRecord["detail"];
  if (typeof detail === "string" && detail.length > 0) {
    return detail;
  }

  const name = errorRecord["name"];
  if (typeof name === "string" && name.length > 0) {
    return name;
  }

  return undefined;
}

function safeStringify(value: unknown): string | undefined {
  try {
    const stringified = JSON.stringify(value);
    return stringified !== "{}" ? stringified : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extracts a meaningful error message from various error types,
 * including YNAB API error responses.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message) {
      return error.message;
    }
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  const ynabApiMessage = getYnabApiErrorMessage(error);
  if (ynabApiMessage) {
    return ynabApiMessage;
  }

  const stringified = safeStringify(error);
  if (stringified) {
    return stringified;
  }

  return "Unknown error occurred";
}
