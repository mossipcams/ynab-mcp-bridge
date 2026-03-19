import type { RequestContext } from "./types.js";

function getFirstHeaderValue(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value.split(",")[0]?.trim();
  }

  return value?.[0]?.split(",")[0]?.trim();
}

export function getRequestOrigin(context: RequestContext) {
  return getFirstHeaderValue(context.headers.origin)?.toLowerCase();
}
