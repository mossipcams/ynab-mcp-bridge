import { getRequestLogFields } from "../requestContext.js";
export function logClientProfileEvent(event, details) {
    console.error("[profile]", event, {
        ...getRequestLogFields(),
        ...details,
    });
}
