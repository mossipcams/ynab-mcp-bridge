import { getStringValue, isRecord } from "../typeUtils.js";
const RESOLVED_CLIENT_PROFILE_KEY = "resolvedClientProfile";
export function setResolvedClientProfile(locals, profile) {
    locals[RESOLVED_CLIENT_PROFILE_KEY] = profile;
}
export function getResolvedClientProfile(locals) {
    const value = locals[RESOLVED_CLIENT_PROFILE_KEY];
    if (!isRecord(value)) {
        return undefined;
    }
    const profileId = getStringValue(value, "profileId");
    const reason = getStringValue(value, "reason");
    if ((profileId === "chatgpt" || profileId === "claude" || profileId === "codex" || profileId === "generic")
        && typeof reason === "string") {
        const detectedProfile = {
            profileId,
            reason,
        };
        return detectedProfile;
    }
    return undefined;
}
