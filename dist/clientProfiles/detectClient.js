const CODEX_DISCOVERY_PATHS = new Set([
    "/.well-known/oauth-authorization-server/sse",
    "/sse/.well-known/oauth-authorization-server",
]);
function getFirstHeaderValue(value) {
    if (typeof value === "string") {
        return value.split(",")[0]?.trim();
    }
    return value?.[0]?.split(",")[0]?.trim();
}
export function detectClientProfile(context) {
    const origin = getFirstHeaderValue(context.headers.origin)?.toLowerCase();
    if (origin === "https://claude.ai") {
        return {
            profileId: "claude",
            reason: "origin:claude.ai",
        };
    }
    if (CODEX_DISCOVERY_PATHS.has(context.path)) {
        return {
            profileId: "codex",
            reason: "path:codex-oauth-probe",
        };
    }
    return {
        profileId: "generic",
        reason: "fallback:generic",
    };
}
function getClientInfoName(clientInfo) {
    if (!clientInfo || typeof clientInfo !== "object") {
        return undefined;
    }
    const name = clientInfo.name;
    return typeof name === "string" ? name.toLowerCase() : undefined;
}
export function detectInitializeClientProfile(input) {
    const clientName = getClientInfoName(input.clientInfo);
    if (!clientName) {
        return undefined;
    }
    if (clientName.includes("codex")) {
        return {
            profileId: "codex",
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
export function reconcileClientProfile(provisionalProfile, confirmedProfile) {
    if (!confirmedProfile || confirmedProfile.profileId === provisionalProfile.profileId) {
        return {
            mismatch: false,
            profile: provisionalProfile,
        };
    }
    return {
        mismatch: true,
        profile: {
            profileId: "generic",
            reason: "reconciled:generic",
        },
    };
}
