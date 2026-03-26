import { getFirstHeaderValue } from "../headerUtils.js";
import type { RequestContext } from "./types.js";

export function getRequestOrigin(context: RequestContext) {
  return getFirstHeaderValue(context.headers["origin"])?.toLowerCase();
}

export function getRequestUserAgent(context: RequestContext) {
  return getFirstHeaderValue(context.headers["user-agent"])?.toLowerCase();
}
