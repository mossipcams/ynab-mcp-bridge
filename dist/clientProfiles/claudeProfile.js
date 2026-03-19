import { genericProfile } from "./genericProfile.js";
export const claudeProfile = {
    ...genericProfile,
    id: "claude",
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
