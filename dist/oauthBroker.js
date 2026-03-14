import crypto from "node:crypto";
import { SignJWT, createRemoteJWKSet, errors, jwtVerify } from "jose";
import { InvalidGrantError, InvalidRequestError, InvalidScopeError, InvalidTokenError, ServerError, } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { createOAuthStore } from "./oauthStore.js";
function parseScopes(scopeClaim) {
    if (typeof scopeClaim !== "string") {
        return [];
    }
    return scopeClaim
        .split(/\s+/)
        .map((scope) => scope.trim())
        .filter(Boolean);
}
function getClientId(payload) {
    if (typeof payload.client_id === "string" && payload.client_id.length > 0) {
        return payload.client_id;
    }
    if (typeof payload.azp === "string" && payload.azp.length > 0) {
        return payload.azp;
    }
    if (typeof payload.sub === "string" && payload.sub.length > 0) {
        return payload.sub;
    }
    throw new InvalidTokenError("Token is missing a client identifier.");
}
function getAudienceValue(payload) {
    if (typeof payload.aud === "string") {
        return payload.aud;
    }
    if (Array.isArray(payload.aud)) {
        const audience = payload.aud.find((value) => typeof value === "string" && value.length > 0);
        if (audience) {
            return audience;
        }
    }
    return undefined;
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
export function createOAuthBroker(config) {
    const store = createOAuthStore(config.storePath);
    const clients = new Map();
    const pendingConsents = new Map();
    const pendingAuthorizations = new Map();
    const authorizationCodes = new Map();
    const refreshTokens = new Map();
    const resourceUrl = new URL(config.publicUrl);
    const issuerUrl = new URL(resourceUrl.origin);
    const callbackUrl = new URL(config.callbackPath, issuerUrl).href;
    const localTokenSecret = Buffer.from(config.tokenSigningSecret ?? crypto.randomBytes(32).toString("base64url"), "utf8");
    const upstreamJwks = createRemoteJWKSet(new URL(config.jwksUrl));
    const allowedAudiences = Array.from(new Set([config.audience, config.publicUrl]));
    async function verifyLocalAccessToken(token) {
        const { payload } = await jwtVerify(token, localTokenSecret, {
            audience: allowedAudiences,
            issuer: issuerUrl.href,
        });
        const resource = getAudienceValue(payload) ?? config.publicUrl;
        return {
            clientId: getClientId(payload),
            expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
            extra: {
                subject: payload.sub,
            },
            resource: new URL(resource),
            scopes: parseScopes(payload.scope),
            token,
        };
    }
    async function verifyUpstreamAccessToken(token) {
        const { payload } = await jwtVerify(token, upstreamJwks, {
            audience: config.audience,
            issuer: config.issuer,
        });
        return {
            clientId: getClientId(payload),
            expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
            extra: {
                subject: payload.sub,
            },
            resource: new URL(config.publicUrl),
            scopes: parseScopes(payload.scope),
            token,
        };
    }
    async function verifyAccessToken(token) {
        try {
            return await verifyLocalAccessToken(token);
        }
        catch {
            // Fall through to upstream verification so Cloudflare-issued JWTs still work.
        }
        try {
            return await verifyUpstreamAccessToken(token);
        }
        catch (error) {
            if (error instanceof errors.JWTExpired) {
                throw new InvalidTokenError("Token has expired.");
            }
            if (error instanceof errors.JWTClaimValidationFailed) {
                if (error.claim === "iss") {
                    throw new InvalidTokenError("Invalid token issuer.");
                }
                if (error.claim === "aud") {
                    throw new InvalidTokenError("Invalid token audience.");
                }
            }
            throw new InvalidTokenError("Invalid access token.");
        }
    }
    async function mintAccessToken(record) {
        return await new SignJWT({
            client_id: record.clientId,
            scope: record.scopes.join(" "),
        })
            .setProtectedHeader({
            alg: "HS256",
            typ: "JWT",
        })
            .setIssuedAt()
            .setIssuer(issuerUrl.href)
            .setAudience(record.resource)
            .setExpirationTime(`${record.expiresInSeconds}s`)
            .setSubject(record.subject)
            .sign(localTokenSecret);
    }
    async function exchangeUpstreamAuthorizationCode(code) {
        const body = new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: callbackUrl,
        });
        const response = await fetch(config.tokenUrl, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
        });
        if (!response.ok) {
            throw new ServerError(`Upstream token exchange failed with status ${response.status}.`);
        }
        return await response.json();
    }
    async function exchangeUpstreamRefreshToken(refreshToken) {
        const body = new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: config.clientId,
            client_secret: config.clientSecret,
        });
        const response = await fetch(config.tokenUrl, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
        });
        if (!response.ok) {
            throw new ServerError(`Upstream refresh exchange failed with status ${response.status}.`);
        }
        return await response.json();
    }
    function buildUpstreamAuthorizationUrl(pending) {
        const upstreamState = crypto.randomBytes(24).toString("base64url");
        pendingAuthorizations.set(upstreamState, pending);
        store.savePendingAuthorization(upstreamState, {
            ...pending,
            expiresAt: Date.now() + 10 * 60 * 1000,
        });
        const upstreamAuthorizationUrl = new URL(config.authorizationUrl);
        upstreamAuthorizationUrl.searchParams.set("client_id", config.clientId);
        upstreamAuthorizationUrl.searchParams.set("redirect_uri", callbackUrl);
        upstreamAuthorizationUrl.searchParams.set("response_type", "code");
        upstreamAuthorizationUrl.searchParams.set("state", upstreamState);
        if (pending.scopes.length > 0) {
            upstreamAuthorizationUrl.searchParams.set("scope", pending.scopes.join(" "));
        }
        upstreamAuthorizationUrl.searchParams.set("resource", pending.resource);
        return upstreamAuthorizationUrl;
    }
    function renderConsentPage(consentChallenge, pending) {
        const clientName = pending.clientName ?? pending.clientId;
        const scopes = pending.scopes.length > 0 ? pending.scopes.join(", ") : "default scopes";
        return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Approve MCP client access</title>
  </head>
  <body>
    <h1>Approve MCP client access</h1>
    <p><strong>${clientName}</strong> is requesting access to ${pending.resource}.</p>
    <p>Requested scopes: ${scopes}</p>
    <form method="post" action="/authorize/consent">
      <input type="hidden" name="consent_challenge" value="${consentChallenge}">
      <button type="submit" name="action" value="approve">Approve</button>
      <button type="submit" name="action" value="deny">Deny</button>
    </form>
  </body>
</html>`;
    }
    const provider = {
        clientsStore: {
            getClient(clientId) {
                return clients.get(clientId) ?? store.getClient(clientId);
            },
            registerClient(client) {
                const clientId = crypto.randomUUID();
                const registeredClient = {
                    ...client,
                    client_id: clientId,
                    client_id_issued_at: Math.floor(Date.now() / 1000),
                };
                clients.set(clientId, registeredClient);
                store.saveClient(registeredClient);
                return registeredClient;
            },
        },
        async authorize(client, params, res) {
            const scopes = params.scopes && params.scopes.length > 0 ? params.scopes : config.scopes;
            const resource = params.resource?.href ?? config.publicUrl;
            if (store.isClientApproved({
                clientId: client.client_id,
                resource,
                scopes,
            })) {
                res.redirect(302, buildUpstreamAuthorizationUrl({
                    clientId: client.client_id,
                    redirectUri: params.redirectUri,
                    resource,
                    scopes,
                    state: params.state,
                    codeChallenge: params.codeChallenge,
                }).href);
                return;
            }
            const consentChallenge = crypto.randomBytes(24).toString("base64url");
            const expiresAt = Date.now() + 10 * 60 * 1000;
            pendingConsents.set(consentChallenge, {
                clientId: client.client_id,
                clientName: client.client_name,
                expiresAt,
                redirectUri: params.redirectUri,
                resource,
                scopes,
                state: params.state,
                codeChallenge: params.codeChallenge,
            });
            store.savePendingConsent(consentChallenge, {
                clientId: client.client_id,
                clientName: client.client_name,
                expiresAt,
                redirectUri: params.redirectUri,
                resource,
                scopes,
                state: params.state,
                codeChallenge: params.codeChallenge,
            });
            res.status(200)
                .type("html")
                .send(renderConsentPage(consentChallenge, pendingConsents.get(consentChallenge)));
        },
        async challengeForAuthorizationCode(client, authorizationCode) {
            const record = authorizationCodes.get(authorizationCode) ?? store.getAuthorizationCode(authorizationCode);
            if (!record || record.clientId !== client.client_id) {
                throw new InvalidGrantError("Unknown authorization code.");
            }
            if (record.expiresAt <= Date.now()) {
                authorizationCodes.delete(authorizationCode);
                throw new InvalidGrantError("Authorization code has expired.");
            }
            return record.codeChallenge;
        },
        async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri, resource) {
            const record = authorizationCodes.get(authorizationCode) ?? store.getAuthorizationCode(authorizationCode);
            if (!record || record.clientId !== client.client_id) {
                throw new InvalidGrantError("Unknown authorization code.");
            }
            if (record.expiresAt <= Date.now()) {
                authorizationCodes.delete(authorizationCode);
                store.deleteAuthorizationCode(authorizationCode);
                throw new InvalidGrantError("Authorization code has expired.");
            }
            if (redirectUri && redirectUri !== record.redirectUri) {
                throw new InvalidGrantError("redirect_uri does not match the authorization request.");
            }
            if (resource?.href && resource.href !== record.resource) {
                throw new InvalidGrantError("resource does not match the authorization request.");
            }
            authorizationCodes.delete(authorizationCode);
            store.deleteAuthorizationCode(authorizationCode);
            const expiresInSeconds = Math.max(60, Math.min(record.upstreamTokens.expires_in ?? 3600, 3600));
            const accessToken = await mintAccessToken({
                clientId: record.clientId,
                expiresInSeconds,
                resource: record.resource,
                scopes: record.scopes,
                subject: record.subject,
            });
            const refreshToken = crypto.randomBytes(32).toString("base64url");
            refreshTokens.set(refreshToken, {
                clientId: record.clientId,
                expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
                resource: record.resource,
                scopes: record.scopes,
                subject: record.subject,
                upstreamTokens: record.upstreamTokens,
            });
            store.saveRefreshToken(refreshToken, {
                clientId: record.clientId,
                expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
                resource: record.resource,
                scopes: record.scopes,
                subject: record.subject,
                upstreamTokens: record.upstreamTokens,
            });
            return {
                access_token: accessToken,
                expires_in: expiresInSeconds,
                refresh_token: refreshToken,
                scope: record.scopes.join(" "),
                token_type: "Bearer",
            };
        },
        async exchangeRefreshToken(client, refreshToken, scopes, resource) {
            const record = refreshTokens.get(refreshToken) ?? store.getRefreshToken(refreshToken);
            if (!record || record.clientId !== client.client_id) {
                throw new InvalidGrantError("Unknown refresh token.");
            }
            if (record.expiresAt <= Date.now()) {
                refreshTokens.delete(refreshToken);
                store.deleteRefreshToken(refreshToken);
                throw new InvalidGrantError("Refresh token has expired.");
            }
            const grantedScopes = scopes && scopes.length > 0 ? scopes : record.scopes;
            if (!grantedScopes.every((scope) => record.scopes.includes(scope))) {
                throw new InvalidScopeError("Requested scope exceeds the original grant.");
            }
            if (resource?.href && resource.href !== record.resource) {
                throw new InvalidGrantError("resource does not match the refresh token.");
            }
            const refreshedUpstreamTokens = await exchangeUpstreamRefreshToken(record.upstreamTokens.refresh_token ?? "");
            const nextUpstreamTokens = {
                ...record.upstreamTokens,
                ...refreshedUpstreamTokens,
                refresh_token: refreshedUpstreamTokens.refresh_token ?? record.upstreamTokens.refresh_token,
            };
            const expiresInSeconds = Math.max(60, Math.min(nextUpstreamTokens.expires_in ?? 3600, 3600));
            const accessToken = await mintAccessToken({
                clientId: record.clientId,
                expiresInSeconds,
                resource: record.resource,
                scopes: grantedScopes,
                subject: record.subject,
            });
            const nextRefreshRecord = {
                clientId: record.clientId,
                expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
                resource: record.resource,
                scopes: record.scopes,
                subject: record.subject,
                upstreamTokens: nextUpstreamTokens,
            };
            refreshTokens.set(refreshToken, nextRefreshRecord);
            store.saveRefreshToken(refreshToken, nextRefreshRecord);
            return {
                access_token: accessToken,
                expires_in: expiresInSeconds,
                refresh_token: refreshToken,
                scope: grantedScopes.join(" "),
                token_type: "Bearer",
            };
        },
        verifyAccessToken,
    };
    const handleConsent = async (req, res, next) => {
        try {
            const consentChallenge = typeof req.body?.consent_challenge === "string" ? req.body.consent_challenge : undefined;
            const action = typeof req.body?.action === "string" ? req.body.action : undefined;
            if (!consentChallenge) {
                throw new InvalidRequestError("Missing consent challenge.");
            }
            const pending = pendingConsents.get(consentChallenge) ?? store.getPendingConsent(consentChallenge);
            if (!pending) {
                throw new InvalidRequestError("Unknown consent challenge.");
            }
            pendingConsents.delete(consentChallenge);
            store.deletePendingConsent(consentChallenge);
            if (action !== "approve") {
                res.redirect(302, createErrorRedirect(pending.redirectUri, {
                    error: "access_denied",
                    error_description: "The user denied access to the MCP client.",
                    state: pending.state,
                }));
                return;
            }
            store.approveClient({
                clientId: pending.clientId,
                resource: pending.resource,
                scopes: pending.scopes,
            });
            res.redirect(302, buildUpstreamAuthorizationUrl({
                clientId: pending.clientId,
                redirectUri: pending.redirectUri,
                resource: pending.resource,
                scopes: pending.scopes,
                state: pending.state,
                codeChallenge: pending.codeChallenge,
            }).href);
        }
        catch (error) {
            if (error instanceof InvalidRequestError) {
                res.status(400).json(error.toResponseObject());
                return;
            }
            next(error);
        }
    };
    const handleCallback = async (req, res, next) => {
        try {
            const upstreamState = typeof req.query.state === "string" ? req.query.state : undefined;
            if (!upstreamState) {
                throw new InvalidRequestError("Missing upstream OAuth state.");
            }
            const pending = pendingAuthorizations.get(upstreamState);
            const storedPending = store.getPendingAuthorization(upstreamState);
            if (!pending && !storedPending) {
                throw new InvalidRequestError("Unknown upstream OAuth state.");
            }
            const resolvedPending = pending ?? storedPending;
            pendingAuthorizations.delete(upstreamState);
            store.deletePendingAuthorization(upstreamState);
            if (typeof req.query.error === "string") {
                res.redirect(302, createErrorRedirect(resolvedPending.redirectUri, {
                    error: req.query.error,
                    error_description: typeof req.query.error_description === "string" ? req.query.error_description : undefined,
                    state: resolvedPending.state,
                }));
                return;
            }
            if (typeof req.query.code !== "string" || req.query.code.length === 0) {
                throw new InvalidRequestError("Missing upstream OAuth code.");
            }
            const upstreamTokens = await exchangeUpstreamAuthorizationCode(req.query.code);
            const authorizationCode = crypto.randomBytes(24).toString("base64url");
            authorizationCodes.set(authorizationCode, {
                ...resolvedPending,
                expiresAt: Date.now() + 5 * 60 * 1000,
                subject: resolvedPending.clientId,
                upstreamTokens,
            });
            store.saveAuthorizationCode(authorizationCode, {
                ...resolvedPending,
                expiresAt: Date.now() + 5 * 60 * 1000,
                subject: resolvedPending.clientId,
                upstreamTokens,
            });
            const redirectUrl = new URL(resolvedPending.redirectUri);
            redirectUrl.searchParams.set("code", authorizationCode);
            if (resolvedPending.state) {
                redirectUrl.searchParams.set("state", resolvedPending.state);
            }
            res.redirect(302, redirectUrl.href);
        }
        catch (error) {
            if (error instanceof InvalidRequestError) {
                res.status(400).json(error.toResponseObject());
                return;
            }
            next(error);
        }
    };
    return {
        callbackPath: config.callbackPath,
        callbackUrl,
        getIssuerUrl: () => new URL(issuerUrl.href),
        handleConsent,
        provider,
        handleCallback,
    };
}
