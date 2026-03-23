import { genericProfile } from "./genericProfile.js";
const CODEX_DISCOVERY_PATHS = new Set([
    "/.well-known/oauth-authorization-server/sse",
    "/sse/.well-known/oauth-authorization-server",
]);
function getFirstHeaderValue(headers, key) {
    const value = headers[key];
    return Array.isArray(value) ? value[0] : value;
}
function hasCodexUserAgent(headers) {
    const userAgent = getFirstHeaderValue(headers, "user-agent") ?? getFirstHeaderValue(headers, "User-Agent");
    return typeof userAgent === "string" && userAgent.toLowerCase().includes("codex");
}
export const codexProfile = {
    ...genericProfile,
    id: "codex",
    detection: {
        getPreAuthReason: (context) => {
            if (hasCodexUserAgent(context.headers)) {
                return "user-agent:codex";
            }
            if (CODEX_DISCOVERY_PATHS.has(context.path)) {
                return "path:codex-oauth-probe";
            }
            return undefined;
        },
        initializeReason: "initialize:client-info",
        preAuthReason: "path:codex-oauth-probe",
    },
    matchesPreAuth: (context) => (CODEX_DISCOVERY_PATHS.has(context.path) ||
        hasCodexUserAgent(context.headers)),
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
