import { genericProfile } from "./genericProfile.js";
export const claudeProfile = {
    ...genericProfile,
    id: "claude",
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
