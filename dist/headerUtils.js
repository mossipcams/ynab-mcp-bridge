export function getFirstHeaderValue(value) {
    const firstValue = typeof value === "string"
        ? value.split(",")[0]
        : value?.[0]?.split(",")[0];
    const normalized = firstValue?.trim();
    return normalized ? normalized : undefined;
}
function normalizeHostname(hostname) {
    if (!hostname) {
        return undefined;
    }
    if (hostname.startsWith("[")) {
        const closingBracketIndex = hostname.indexOf("]");
        if (closingBracketIndex !== -1) {
            return hostname.slice(0, closingBracketIndex + 1);
        }
    }
    const colonIndex = hostname.lastIndexOf(":");
    if (colonIndex !== -1 && hostname.indexOf(":") === colonIndex) {
        return hostname.slice(0, colonIndex);
    }
    return hostname;
}
export function isLoopbackHostname(hostname) {
    const normalizedHostname = normalizeHostname(hostname);
    return normalizedHostname === "127.0.0.1"
        || normalizedHostname === "::1"
        || normalizedHostname === "[::1]"
        || normalizedHostname === "localhost";
}
