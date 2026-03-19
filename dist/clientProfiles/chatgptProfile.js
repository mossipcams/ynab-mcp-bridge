import { genericProfile } from "./genericProfile.js";
export const chatgptProfile = {
    ...genericProfile,
    id: "chatgpt",
    matchesInitialize: (clientInfo) => {
        const name = typeof clientInfo?.name === "string"
            ? clientInfo.name.toLowerCase()
            : undefined;
        return Boolean(name && (name.includes("chatgpt") || name.includes("openai-mcp")));
    },
    oauth: {
        ...genericProfile.oauth,
        discoveryPathVariants: [
            "/.well-known/oauth-authorization-server",
            "/.well-known/oauth-protected-resource",
        ],
        tolerateExtraDiscoveryProbes: true,
    },
};
