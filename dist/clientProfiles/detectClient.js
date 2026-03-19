const CHATGPT_DISCOVERY_PATHS = new Set([
    "/.well-known/oauth-protected-resource",
]);
function getClientInfoName(clientInfo) {
    if (!clientInfo || typeof clientInfo !== "object") {
        return undefined;
    }
    const name = clientInfo.name;
    return typeof name === "string" ? name.toLowerCase() : undefined;
}
export function detectClientProfile(context) {
    const origin = context.headers.origin;
    const firstOrigin = typeof origin === "string" ? origin.split(",")[0]?.trim().toLowerCase() : origin?.[0]?.split(",")[0]?.trim().toLowerCase();
    if (firstOrigin === "https://claude.ai") {
        return {
            profileId: "claude",
            reason: "origin:claude.ai",
        };
    }
    if (CHATGPT_DISCOVERY_PATHS.has(context.path)) {
        return {
            profileId: "chatgpt",
            reason: "path:chatgpt-protected-resource-probe",
        };
    }
    return {
        profileId: "generic",
        reason: "fallback:generic",
    };
}
export function detectInitializeClientProfile(input) {
    const clientName = getClientInfoName(input.clientInfo);
    if (!clientName) {
        return undefined;
    }
    if (clientName.includes("chatgpt") || clientName.includes("openai-mcp")) {
        return {
            profileId: "chatgpt",
            reason: "initialize:client-info",
        };
    }
    if (clientName.includes("claude")) {
        return {
            profileId: "claude",
            reason: "initialize:client-info",
        };
    }
    return undefined;
}
