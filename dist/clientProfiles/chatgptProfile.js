import { genericProfile } from "./genericProfile.js";
const CHATGPT_DISCOVERY_PATHS = new Set([
    "/.well-known/oauth-protected-resource",
]);
function getFirstHeaderValue(headers, key) {
    const value = headers[key];
    return Array.isArray(value) ? value[0] : value;
}
function hasChatGptUserAgent(headers) {
    const userAgent = getFirstHeaderValue(headers, "user-agent") ?? getFirstHeaderValue(headers, "User-Agent");
    return typeof userAgent === "string" && userAgent.toLowerCase().includes("chatgpt");
}
export const chatgptProfile = {
    ...genericProfile,
    id: "chatgpt",
    detection: {
        getPreAuthReason: (context) => {
            if (hasChatGptUserAgent(context.headers)) {
                return "user-agent:chatgpt";
            }
            if (CHATGPT_DISCOVERY_PATHS.has(context.path)) {
                return "path:chatgpt-protected-resource-probe";
            }
            return undefined;
        },
        initializeReason: "initialize:client-info",
        preAuthReason: "path:chatgpt-protected-resource-probe",
    },
    matchesPreAuth: (context) => (CHATGPT_DISCOVERY_PATHS.has(context.path) ||
        hasChatGptUserAgent(context.headers)),
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
