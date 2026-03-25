import { logAppEvent } from "../logger.js";
export function logClientProfileEvent(event, details) {
    logAppEvent("profile", event, details);
}
