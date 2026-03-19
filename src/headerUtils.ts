export function getFirstHeaderValue(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value.split(",")[0]?.trim();
  }

  return value?.[0]?.split(",")[0]?.trim();
}

export function isLoopbackHostname(hostname: string | undefined) {
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]" || hostname === "localhost";
}
