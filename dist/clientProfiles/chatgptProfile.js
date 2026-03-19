import { genericProfile } from "./genericProfile.js";
export const chatgptProfile = {
    ...genericProfile,
    id: "chatgpt",
    oauth: {
        ...genericProfile.oauth,
        discoveryPathVariants: [
            "/.well-known/oauth-authorization-server",
            "/.well-known/oauth-protected-resource",
        ],
        tolerateExtraDiscoveryProbes: true,
    },
};
