import { logAppEvent } from "../logger.js";

export function logClientProfileEvent(event: string, details: Record<string, unknown>) {
  logAppEvent("profile", event, details);
}
