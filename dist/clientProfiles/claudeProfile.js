import { genericProfile } from "./genericProfile.js";
import { getStringValue, isRecord } from "../typeUtils.js";
export const claudeProfile = {
    ...genericProfile,
    id: "claude",
    detection: {
        initializeReason: "initialize:client-info",
    },
    matchesPreAuth: () => false,
    matchesInitialize: (clientInfo) => Boolean(isRecord(clientInfo) &&
        getStringValue(clientInfo, "name")?.toLowerCase().includes("claude")),
    oauth: {
        ...genericProfile.oauth,
        tolerateMissingResourceParam: true,
        tokenRequestLeniency: "normal",
    },
    transport: {
        ...genericProfile.transport,
        acceptSessionHeaderButIgnoreIt: true,
    },
};
