import { createHash } from "node:crypto";

import { logAppEvent } from "../../logger.js";

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function fingerprintAuthValue(value: string) {
  return fingerprint(value);
}

export function logAuthEvent(event: string, details: Record<string, unknown> = {}) {
  logAppEvent("auth2", event, details);
}
