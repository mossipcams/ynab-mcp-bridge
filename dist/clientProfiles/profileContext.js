const RESOLVED_CLIENT_PROFILE_KEY = "resolvedClientProfile";
export function setResolvedClientProfile(locals, profile) {
    locals[RESOLVED_CLIENT_PROFILE_KEY] = profile;
}
export function getResolvedClientProfile(locals) {
    return locals[RESOLVED_CLIENT_PROFILE_KEY];
}
