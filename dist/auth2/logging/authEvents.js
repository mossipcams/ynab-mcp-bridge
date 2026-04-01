import { createHash } from "node:crypto";
import { logAppEvent } from "../../logger.js";
function fingerprint(value) {
    return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
export function fingerprintAuthValue(value) {
    return fingerprint(value);
}
export function logAuthEvent(event, details = {}) {
    logAppEvent("auth2", event, details);
}
