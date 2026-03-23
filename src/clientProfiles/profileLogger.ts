import { getRequestLogFields } from "../requestContext.js";

export function logClientProfileEvent(event: string, details: Record<string, unknown>) {
  console.error("[profile]", event, {
    ...getRequestLogFields(),
    ...details,
  });
}
