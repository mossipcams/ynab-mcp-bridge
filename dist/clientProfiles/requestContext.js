import { getFirstHeaderValue } from "../headerUtils.js";
export function getRequestOrigin(context) {
    return getFirstHeaderValue(context.headers["origin"])?.toLowerCase();
}
export function getRequestUserAgent(context) {
    return getFirstHeaderValue(context.headers["user-agent"])?.toLowerCase();
}
