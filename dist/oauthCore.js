import { InvalidGrantError, InvalidRequestError, InvalidScopeError, } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { getEffectiveOAuthScopes } from "./config.js";
import { parseAuthorizationRequest, parseClientMetadata } from "./oauthSchemas.js";
function clampExpiresIn(expiresIn) {
    return Math.max(60, Math.min(expiresIn ?? 3600, 3600));
}
function createErrorRedirect(redirectUri, params) {
    const url = new URL(redirectUri);
    for (const [name, value] of Object.entries(params)) {
        if (value) {
            url.searchParams.set(name, value);
        }
    }
    return url.href;
}
function isExpired(expiresAt, now) {
    return expiresAt !== undefined && expiresAt <= now;
}
function assertRegisteredRedirectUri(client, redirectUri) {
    if (!client.redirect_uris.includes(redirectUri)) {
        throw new InvalidRequestError("redirect_uri does not match a registered client redirect URI.");
    }
}
function toPendingConsent(grant) {
    if (!grant.consent) {
        throw new InvalidRequestError("Unknown consent challenge.");
    }
    return {
        clientId: grant.clientId,
        clientName: grant.clientName,
        codeChallenge: grant.codeChallenge,
        expiresAt: grant.consent.expiresAt,
        redirectUri: grant.redirectUri,
        resource: grant.resource,
        scopes: grant.scopes,
        state: grant.state,
    };
}
export function createOAuthCore({ config, dependencies, store }) {
    async function registerClient(client) {
        const parsedClient = parseClientMetadata(client);
        const registeredClient = {
            ...parsedClient,
            client_id: dependencies.createClientId?.() ?? dependencies.createId(),
            client_id_issued_at: Math.floor(dependencies.now() / 1000),
        };
        store.saveClient(registeredClient);
        return registeredClient;
    }
    async function startAuthorization(client, params) {
        const parsedParams = parseAuthorizationRequest(params);
        assertRegisteredRedirectUri(client, parsedParams.redirectUri);
        const scopes = getEffectiveOAuthScopes(parsedParams.scopes && parsedParams.scopes.length > 0 ? parsedParams.scopes : config.defaultScopes);
        const resource = parsedParams.resource?.href ?? config.defaultResource;
        if (store.isClientApproved({
            clientId: client.client_id,
            resource,
            scopes,
        })) {
            const upstreamState = dependencies.createId();
            store.saveGrant({
                clientId: client.client_id,
                codeChallenge: parsedParams.codeChallenge,
                grantId: upstreamState,
                pendingAuthorization: {
                    expiresAt: dependencies.now() + 10 * 60 * 1000,
                    stateId: upstreamState,
                },
                redirectUri: parsedParams.redirectUri,
                resource,
                scopes,
                state: parsedParams.state,
            });
            return {
                type: "redirect",
                location: dependencies.createUpstreamAuthorizationUrl({
                    resource,
                    scopes,
                    upstreamState,
                }),
            };
        }
        const consentChallenge = dependencies.createId();
        const grant = {
            clientId: client.client_id,
            clientName: client.client_name,
            codeChallenge: parsedParams.codeChallenge,
            consent: {
                challenge: consentChallenge,
                expiresAt: dependencies.now() + 10 * 60 * 1000,
            },
            grantId: consentChallenge,
            redirectUri: parsedParams.redirectUri,
            resource,
            scopes,
            state: parsedParams.state,
        };
        store.saveGrant(grant);
        return {
            type: "consent",
            consentChallenge,
            pending: toPendingConsent(grant),
        };
    }
    async function approveConsent(consentChallenge, action) {
        const grant = store.getPendingConsentGrant(consentChallenge);
        if (!grant || isExpired(grant.consent?.expiresAt, dependencies.now())) {
            if (grant) {
                store.deleteGrant(grant.grantId);
            }
            throw new InvalidRequestError("Unknown consent challenge.");
        }
        store.deleteGrant(grant.grantId);
        if (action !== "approve") {
            return {
                type: "redirect",
                location: createErrorRedirect(grant.redirectUri, {
                    error: "access_denied",
                    error_description: "The user denied access to the MCP client.",
                    state: grant.state,
                }),
            };
        }
        store.approveClient({
            clientId: grant.clientId,
            resource: grant.resource,
            scopes: grant.scopes,
        });
        const upstreamState = dependencies.createId();
        store.saveGrant({
            ...grant,
            consent: undefined,
            pendingAuthorization: {
                expiresAt: dependencies.now() + 10 * 60 * 1000,
                stateId: upstreamState,
            },
        });
        return {
            type: "redirect",
            location: dependencies.createUpstreamAuthorizationUrl({
                resource: grant.resource,
                scopes: grant.scopes,
                upstreamState,
            }),
        };
    }
    async function handleCallback(params) {
        const grant = store.getPendingAuthorizationGrant(params.upstreamState);
        if (!grant || isExpired(grant.pendingAuthorization?.expiresAt, dependencies.now())) {
            if (grant) {
                store.deleteGrant(grant.grantId);
            }
            throw new InvalidRequestError("Unknown upstream OAuth state.");
        }
        store.deleteGrant(grant.grantId);
        if (params.error) {
            return {
                type: "redirect",
                location: createErrorRedirect(grant.redirectUri, {
                    error: params.error,
                    error_description: params.errorDescription,
                    state: grant.state,
                }),
            };
        }
        if (!params.code) {
            throw new InvalidRequestError("Missing upstream OAuth code.");
        }
        const authorizationCode = dependencies.createId();
        const upstreamTokens = await dependencies.exchangeUpstreamAuthorizationCode(params.code);
        store.saveGrant({
            ...grant,
            authorizationCode: {
                code: authorizationCode,
                expiresAt: dependencies.now() + 5 * 60 * 1000,
            },
            pendingAuthorization: undefined,
            principalId: grant.clientId,
            upstreamTokens,
        });
        const redirectUrl = new URL(grant.redirectUri);
        redirectUrl.searchParams.set("code", authorizationCode);
        if (grant.state) {
            redirectUrl.searchParams.set("state", grant.state);
        }
        return {
            type: "redirect",
            location: redirectUrl.href,
        };
    }
    async function getAuthorizationCodeChallenge(client, authorizationCode) {
        const grant = store.getAuthorizationCodeGrant(authorizationCode);
        if (!grant || !grant.authorizationCode || grant.clientId !== client.client_id) {
            throw new InvalidGrantError("Unknown authorization code.");
        }
        if (isExpired(grant.authorizationCode.expiresAt, dependencies.now())) {
            store.deleteGrant(grant.grantId);
            throw new InvalidGrantError("Authorization code has expired.");
        }
        return grant.codeChallenge;
    }
    async function exchangeAuthorizationCode(client, authorizationCode, redirectUri, resource) {
        const grant = store.getAuthorizationCodeGrant(authorizationCode);
        if (!grant || !grant.authorizationCode || grant.clientId !== client.client_id) {
            throw new InvalidGrantError("Unknown authorization code.");
        }
        if (isExpired(grant.authorizationCode.expiresAt, dependencies.now())) {
            store.deleteGrant(grant.grantId);
            throw new InvalidGrantError("Authorization code has expired.");
        }
        if (redirectUri && redirectUri !== grant.redirectUri) {
            throw new InvalidGrantError("redirect_uri does not match the authorization request.");
        }
        if (resource?.href && resource.href !== grant.resource) {
            throw new InvalidGrantError("resource does not match the authorization request.");
        }
        if (!grant.principalId || !grant.upstreamTokens) {
            store.deleteGrant(grant.grantId);
            throw new InvalidGrantError("Authorization code is missing grant context.");
        }
        store.deleteGrant(grant.grantId);
        const expiresInSeconds = clampExpiresIn(grant.upstreamTokens.expires_in);
        const accessToken = await dependencies.mintAccessToken({
            clientId: grant.clientId,
            expiresInSeconds,
            principalId: grant.principalId,
            resource: grant.resource,
            scopes: grant.scopes,
        });
        const refreshToken = dependencies.createId();
        store.saveGrant({
            ...grant,
            authorizationCode: undefined,
            refreshToken: {
                expiresAt: dependencies.now() + 30 * 24 * 60 * 60 * 1000,
                token: refreshToken,
            },
        });
        return {
            access_token: accessToken,
            expires_in: expiresInSeconds,
            refresh_token: refreshToken,
            scope: grant.scopes.join(" "),
            token_type: "Bearer",
        };
    }
    async function exchangeRefreshToken(client, refreshToken, scopes, resource) {
        const grant = store.getRefreshTokenGrant(refreshToken);
        if (!grant || !grant.refreshToken || grant.clientId !== client.client_id) {
            throw new InvalidGrantError("Unknown refresh token.");
        }
        if (isExpired(grant.refreshToken.expiresAt, dependencies.now())) {
            store.deleteGrant(grant.grantId);
            throw new InvalidGrantError("Refresh token has expired.");
        }
        const grantedScopes = scopes && scopes.length > 0 ? scopes : grant.scopes;
        if (!grantedScopes.every((scope) => grant.scopes.includes(scope))) {
            throw new InvalidScopeError("Requested scope exceeds the original grant.");
        }
        if (resource?.href && resource.href !== grant.resource) {
            throw new InvalidGrantError("resource does not match the refresh token.");
        }
        const refreshedUpstreamTokens = await dependencies.exchangeUpstreamRefreshToken(grant.upstreamTokens?.refresh_token ?? "");
        const nextUpstreamTokens = {
            ...grant.upstreamTokens,
            ...refreshedUpstreamTokens,
            refresh_token: refreshedUpstreamTokens.refresh_token ?? grant.upstreamTokens?.refresh_token,
        };
        if (!grant.principalId) {
            store.deleteGrant(grant.grantId);
            throw new InvalidGrantError("Refresh token is missing grant context.");
        }
        const expiresInSeconds = clampExpiresIn(nextUpstreamTokens.expires_in);
        const accessToken = await dependencies.mintAccessToken({
            clientId: grant.clientId,
            expiresInSeconds,
            principalId: grant.principalId,
            resource: grant.resource,
            scopes: grantedScopes,
        });
        const nextRefreshToken = dependencies.createId();
        store.saveGrant({
            ...grant,
            refreshToken: {
                expiresAt: dependencies.now() + 30 * 24 * 60 * 60 * 1000,
                token: nextRefreshToken,
            },
            upstreamTokens: nextUpstreamTokens,
        });
        return {
            access_token: accessToken,
            expires_in: expiresInSeconds,
            refresh_token: nextRefreshToken,
            scope: grantedScopes.join(" "),
            token_type: "Bearer",
        };
    }
    return {
        approveConsent,
        exchangeAuthorizationCode,
        exchangeRefreshToken,
        getAuthorizationCodeChallenge,
        getClient: store.getClient,
        handleCallback,
        registerClient,
        startAuthorization,
    };
}
