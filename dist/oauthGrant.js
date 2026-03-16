export function normalizeScopes(scopes) {
    return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))].sort();
}
export function normalizeGrant(grant) {
    return {
        ...grant,
        scopes: normalizeScopes(grant.scopes),
    };
}
export function getGrantExpiry(grant) {
    return grant.consent?.expiresAt ??
        grant.pendingAuthorization?.expiresAt ??
        grant.authorizationCode?.expiresAt ??
        grant.refreshToken?.expiresAt;
}
export function hasActiveGrantStep(grant) {
    return grant.consent !== undefined ||
        grant.pendingAuthorization !== undefined ||
        grant.authorizationCode !== undefined ||
        grant.refreshToken !== undefined;
}
