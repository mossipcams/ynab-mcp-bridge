import { logAppEvent } from "../logger.js";
import { getRequestLogFields } from "../requestContext.js";
export function logClientProfileEvent(event, details) {
    logAppEvent("profile", event, {
        ...getRequestLogFields(),
        ...details,
    });
}
