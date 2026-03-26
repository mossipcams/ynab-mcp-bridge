import { logAppEvent } from "../logger.js";
import { getRequestLogFields } from "../requestContext.js";

export function logClientProfileEvent(event: string, details: Record<string, unknown>) {
  logAppEvent("profile", event, {
    ...getRequestLogFields(),
    ...details,
  });
}
