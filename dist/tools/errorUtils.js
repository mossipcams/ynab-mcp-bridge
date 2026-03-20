function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function getYnabApiErrorMessage(error) {
    if (!isRecord(error) || !isRecord(error.error)) {
        return undefined;
    }
    const detail = error.error.detail;
    if (typeof detail === "string" && detail.length > 0) {
        return detail;
    }
    const name = error.error.name;
    if (typeof name === "string" && name.length > 0) {
        return name;
    }
    return undefined;
}
function safeStringify(value) {
    try {
        const stringified = JSON.stringify(value);
        return stringified !== "{}" ? stringified : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Extracts a meaningful error message from various error types,
 * including YNAB API error responses.
 */
export function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
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
