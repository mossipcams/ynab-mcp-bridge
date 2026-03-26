function toBasePendingRecord(grant, expiresAt) {
    return {
        clientId: grant.clientId,
        codeChallenge: grant.codeChallenge,
        expiresAt,
        redirectUri: grant.redirectUri,
        resource: grant.resource,
        scopes: grant.scopes,
        state: grant.state,
    };
}
export function toPendingConsentRecord(grant) {
    if (!grant.consent) {
        return undefined;
    }
    return {
        ...toBasePendingRecord(grant, grant.consent.expiresAt),
        clientName: grant.clientName,
    };
}
export function toPendingAuthorizationRecord(grant) {
    if (!grant.pendingAuthorization) {
        return undefined;
    }
    return toBasePendingRecord(grant, grant.pendingAuthorization.expiresAt);
}
export function toAuthorizationCodeRecord(grant) {
    if (!grant.authorizationCode || !grant.principalId || !grant.upstreamTokens) {
        return undefined;
    }
    return {
        ...toBasePendingRecord(grant, grant.authorizationCode.expiresAt),
        principalId: grant.principalId,
        upstreamTokens: grant.upstreamTokens,
    };
}
export function toRefreshTokenRecord(grant) {
    if (!grant.refreshToken || !grant.principalId || !grant.upstreamTokens) {
        return undefined;
    }
    return {
        clientId: grant.clientId,
        expiresAt: grant.refreshToken.expiresAt,
        principalId: grant.principalId,
        resource: grant.resource,
        scopes: grant.scopes,
        upstreamTokens: grant.upstreamTokens,
    };
}
