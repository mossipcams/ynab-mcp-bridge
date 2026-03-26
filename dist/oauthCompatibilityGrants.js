import { normalizeGrant } from "./oauthGrant.js";
export function createAuthorizationCodeCompatibilityGrant(code, record) {
    return normalizeGrant({
        authorizationCode: {
            code,
            expiresAt: record.expiresAt,
        },
        clientId: record.clientId,
        codeChallenge: record.codeChallenge,
        grantId: `compat-code:${code}`,
        redirectUri: record.redirectUri,
        resource: record.resource,
        scopes: record.scopes,
        state: record.state,
        principalId: record.principalId,
        upstreamTokens: record.upstreamTokens,
    });
}
export function createPendingAuthorizationCompatibilityGrant(stateId, record) {
    return normalizeGrant({
        clientId: record.clientId,
        codeChallenge: record.codeChallenge,
        grantId: `compat-authorization:${stateId}`,
        pendingAuthorization: {
            expiresAt: record.expiresAt,
            stateId,
        },
        redirectUri: record.redirectUri,
        resource: record.resource,
        scopes: record.scopes,
        state: record.state,
    });
}
export function createPendingConsentCompatibilityGrant(consentId, record) {
    return normalizeGrant({
        clientId: record.clientId,
        clientName: record.clientName,
        codeChallenge: record.codeChallenge,
        consent: {
            challenge: consentId,
            expiresAt: record.expiresAt,
        },
        grantId: `compat-consent:${consentId}`,
        redirectUri: record.redirectUri,
        resource: record.resource,
        scopes: record.scopes,
        state: record.state,
    });
}
export function createRefreshTokenCompatibilityGrant(refreshToken, record) {
    return normalizeGrant({
        clientId: record.clientId,
        codeChallenge: "",
        grantId: `compat-refresh:${refreshToken}`,
        redirectUri: "",
        refreshToken: {
            expiresAt: record.expiresAt,
            token: refreshToken,
        },
        resource: record.resource,
        scopes: record.scopes,
        principalId: record.principalId,
        upstreamTokens: record.upstreamTokens,
    });
}
