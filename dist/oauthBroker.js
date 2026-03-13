import crypto from "node:crypto";
import { SignJWT, createRemoteJWKSet, errors, jwtVerify } from "jose";
import { InvalidGrantError, InvalidRequestError, InvalidScopeError, InvalidTokenError, ServerError, } from "@modelcontextprotocol/sdk/server/auth/errors.js";
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
    const clients = new Map();
    const pendingAuthorizations = new Map();
    const authorizationCodes = new Map();
    const refreshTokens = new Map();
    const resourceUrl = new URL(config.publicUrl);
    const issuerUrl = new URL(resourceUrl.origin);
    const callbackUrl = new URL(config.callbackPath, issuerUrl).href;
    const localTokenSecret = crypto.randomBytes(32);
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
    const provider = {
        clientsStore: {
            getClient(clientId) {
                return clients.get(clientId);
            },
            registerClient(client) {
                const clientId = crypto.randomUUID();
                const registeredClient = {
                    ...client,
                    client_id: clientId,
                    client_id_issued_at: Math.floor(Date.now() / 1000),
                };
                clients.set(clientId, registeredClient);
                return registeredClient;
            },
        },
        async authorize(client, params, res) {
            const upstreamState = crypto.randomBytes(24).toString("base64url");
            const scopes = params.scopes && params.scopes.length > 0 ? params.scopes : config.scopes;
            const resource = params.resource?.href ?? config.publicUrl;
            pendingAuthorizations.set(upstreamState, {
                clientId: client.client_id,
                redirectUri: params.redirectUri,
                resource,
                scopes,
                state: params.state,
                codeChallenge: params.codeChallenge,
            });
            const upstreamAuthorizationUrl = new URL(config.authorizationUrl);
            upstreamAuthorizationUrl.searchParams.set("client_id", config.clientId);
            upstreamAuthorizationUrl.searchParams.set("redirect_uri", callbackUrl);
            upstreamAuthorizationUrl.searchParams.set("response_type", "code");
            upstreamAuthorizationUrl.searchParams.set("state", upstreamState);
            if (scopes.length > 0) {
                upstreamAuthorizationUrl.searchParams.set("scope", scopes.join(" "));
            }
            upstreamAuthorizationUrl.searchParams.set("resource", resource);
            res.redirect(302, upstreamAuthorizationUrl.href);
        },
        async challengeForAuthorizationCode(client, authorizationCode) {
            const record = authorizationCodes.get(authorizationCode);
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
            const record = authorizationCodes.get(authorizationCode);
            if (!record || record.clientId !== client.client_id) {
                throw new InvalidGrantError("Unknown authorization code.");
            }
            if (record.expiresAt <= Date.now()) {
                authorizationCodes.delete(authorizationCode);
                throw new InvalidGrantError("Authorization code has expired.");
            }
            if (redirectUri && redirectUri !== record.redirectUri) {
                throw new InvalidGrantError("redirect_uri does not match the authorization request.");
            }
            if (resource?.href && resource.href !== record.resource) {
                throw new InvalidGrantError("resource does not match the authorization request.");
            }
            authorizationCodes.delete(authorizationCode);
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
            return {
                access_token: accessToken,
                expires_in: expiresInSeconds,
                refresh_token: refreshToken,
                scope: record.scopes.join(" "),
                token_type: "Bearer",
            };
        },
        async exchangeRefreshToken(client, refreshToken, scopes, resource) {
            const record = refreshTokens.get(refreshToken);
            if (!record || record.clientId !== client.client_id) {
                throw new InvalidGrantError("Unknown refresh token.");
            }
            if (record.expiresAt <= Date.now()) {
                refreshTokens.delete(refreshToken);
                throw new InvalidGrantError("Refresh token has expired.");
            }
            const grantedScopes = scopes && scopes.length > 0 ? scopes : record.scopes;
            if (!grantedScopes.every((scope) => record.scopes.includes(scope))) {
                throw new InvalidScopeError("Requested scope exceeds the original grant.");
            }
            if (resource?.href && resource.href !== record.resource) {
                throw new InvalidGrantError("resource does not match the refresh token.");
            }
            const expiresInSeconds = Math.max(60, Math.min(record.upstreamTokens.expires_in ?? 3600, 3600));
            const accessToken = await mintAccessToken({
                clientId: record.clientId,
                expiresInSeconds,
                resource: record.resource,
                scopes: grantedScopes,
                subject: record.subject,
            });
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
    const handleCallback = async (req, res, next) => {
        try {
            const upstreamState = typeof req.query.state === "string" ? req.query.state : undefined;
            if (!upstreamState) {
                throw new InvalidRequestError("Missing upstream OAuth state.");
            }
            const pending = pendingAuthorizations.get(upstreamState);
            if (!pending) {
                throw new InvalidRequestError("Unknown upstream OAuth state.");
            }
            pendingAuthorizations.delete(upstreamState);
            if (typeof req.query.error === "string") {
                res.redirect(302, createErrorRedirect(pending.redirectUri, {
                    error: req.query.error,
                    error_description: typeof req.query.error_description === "string" ? req.query.error_description : undefined,
                    state: pending.state,
                }));
                return;
            }
            if (typeof req.query.code !== "string" || req.query.code.length === 0) {
                throw new InvalidRequestError("Missing upstream OAuth code.");
            }
            const upstreamTokens = await exchangeUpstreamAuthorizationCode(req.query.code);
            const authorizationCode = crypto.randomBytes(24).toString("base64url");
            authorizationCodes.set(authorizationCode, {
                ...pending,
                expiresAt: Date.now() + 5 * 60 * 1000,
                subject: pending.clientId,
                upstreamTokens,
            });
            const redirectUrl = new URL(pending.redirectUri);
            redirectUrl.searchParams.set("code", authorizationCode);
            if (pending.state) {
                redirectUrl.searchParams.set("state", pending.state);
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
        provider,
        handleCallback,
    };
}
