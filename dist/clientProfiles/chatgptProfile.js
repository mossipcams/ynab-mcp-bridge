import { genericProfile } from "./genericProfile.js";
const CHATGPT_DISCOVERY_PATHS = new Set([
    "/.well-known/oauth-protected-resource",
]);
export const chatgptProfile = {
    ...genericProfile,
    id: "chatgpt",
    detection: {
        initializeReason: "initialize:client-info",
        preAuthReason: "path:chatgpt-protected-resource-probe",
    },
    matchesPreAuth: (context) => CHATGPT_DISCOVERY_PATHS.has(context.path),
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
