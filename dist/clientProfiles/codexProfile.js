import { genericProfile } from "./genericProfile.js";
export const codexProfile = {
    ...genericProfile,
    id: "codex",
    matchesInitialize: (clientInfo) => (typeof clientInfo?.name === "string" &&
        clientInfo.name.toLowerCase().includes("codex")),
    oauth: {
        ...genericProfile.oauth,
        discoveryPathVariants: [
            "/.well-known/oauth-authorization-server",
            "/.well-known/oauth-authorization-server/sse",
            "/sse/.well-known/oauth-authorization-server",
        ],
        tolerateExtraDiscoveryProbes: true,
    },
};
