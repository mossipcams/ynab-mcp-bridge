export function getFirstHeaderValue(value) {
    if (typeof value === "string") {
        return value.split(",")[0]?.trim();
    }
    return value?.[0]?.split(",")[0]?.trim();
}
export function isLoopbackHostname(hostname) {
    return hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]" || hostname === "localhost";
}
