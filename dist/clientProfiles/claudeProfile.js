import { genericProfile } from "./genericProfile.js";
import { getRequestOrigin } from "./requestContext.js";
export const claudeProfile = {
    ...genericProfile,
    id: "claude",
    detection: {
        initializeReason: "initialize:client-info",
        preAuthReason: "origin:claude.ai",
    },
    matchesPreAuth: (context) => getRequestOrigin(context) === "https://claude.ai",
    matchesInitialize: (clientInfo) => (typeof clientInfo?.name === "string" &&
        clientInfo.name.toLowerCase().includes("claude")),
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
