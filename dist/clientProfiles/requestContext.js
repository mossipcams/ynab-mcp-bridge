export function getFirstHeaderValue(value) {
    if (typeof value === "string") {
        return value.split(",")[0]?.trim();
    }
    return value?.[0]?.split(",")[0]?.trim();
}
export function getRequestOrigin(context) {
    return getFirstHeaderValue(context.headers.origin)?.toLowerCase();
}
