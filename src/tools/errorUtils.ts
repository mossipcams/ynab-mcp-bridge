function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Extracts a meaningful error message from various error types,
 * including YNAB API error responses.
 */
export function getErrorMessage(error: unknown): string {
  // Handle standard Error objects
  if (error instanceof Error) {
    return error.message;
  }

  // Handle YNAB API error responses which have the structure:
  // { error: { id: '...', name: '...', detail: '...' } }
  if (isRecord(error) && isRecord(error.error)) {
    const detail = error.error.detail;
    if (typeof detail === "string" && detail.length > 0) {
      return detail;
    }

    const name = error.error.name;
    if (typeof name === "string" && name.length > 0) {
      return name;
    }
  }

  // Fallback: try to stringify the error
  try {
    const stringified = JSON.stringify(error);
    if (stringified !== '{}') {
      return stringified;
    }
  } catch {
    // Ignore stringify errors
  }

  return "Unknown error occurred";
}
