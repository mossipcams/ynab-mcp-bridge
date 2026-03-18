import crypto from "node:crypto";
import { SignJWT, createRemoteJWKSet, errors, jwtVerify } from "jose";
import { InvalidRequestError, InvalidTokenError, ServerError, } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { logAppEvent } from "./logger.js";
import { createOAuthCore } from "./oauthCore.js";
import { createOAuthStore } from "./oauthStore.js";
const CONSENT_PAGE_HEADERS = {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    pragma: "no-cache",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
};
function getErrorDetails(error) {
    if (error instanceof Error) {
        return {
            errorMessage: error.message,
            errorName: error.name,
        };
    }
    return {
        errorMessage: String(error),
        errorName: "UnknownError",
    };
}
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
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}
export function createOAuthBroker(config) {
    const store = createOAuthStore(config.storePath);
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
        const upstreamAuthorizationUrl = new URL(config.authorizationUrl);
        upstreamAuthorizationUrl.searchParams.set("client_id", config.clientId);
        upstreamAuthorizationUrl.searchParams.set("redirect_uri", callbackUrl);
        upstreamAuthorizationUrl.searchParams.set("response_type", "code");
        upstreamAuthorizationUrl.searchParams.set("state", pending.upstreamState);
        if (pending.scopes.length > 0) {
            upstreamAuthorizationUrl.searchParams.set("scope", pending.scopes.join(" "));
        }
        upstreamAuthorizationUrl.searchParams.set("resource", pending.resource);
        return upstreamAuthorizationUrl;
    }
    const core = createOAuthCore({
        config: {
            callbackUrl,
            defaultResource: config.publicUrl,
            defaultScopes: config.scopes,
        },
        dependencies: {
            createId: () => crypto.randomBytes(24).toString("base64url"),
            createUpstreamAuthorizationUrl: (pending) => buildUpstreamAuthorizationUrl(pending).href,
            exchangeUpstreamAuthorizationCode,
            exchangeUpstreamRefreshToken,
            mintAccessToken,
            now: () => Date.now(),
        },
        store,
    });
    function renderConsentPage(consentChallenge, pending) {
        const clientName = escapeHtml(pending.clientName ?? pending.clientId);
        const resource = escapeHtml(pending.resource);
        const scopes = escapeHtml(pending.scopes.length > 0 ? pending.scopes.join(", ") : "default scopes");
        const escapedConsentChallenge = escapeHtml(consentChallenge);
        return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Approve MCP client access</title>
  </head>
  <body>
    <h1>Approve MCP client access</h1>
    <p><strong>${clientName}</strong> is requesting access to ${resource}.</p>
    <p>Requested scopes: ${scopes}</p>
    <form method="post" action="/authorize/consent">
      <input type="hidden" name="consent_challenge" value="${escapedConsentChallenge}">
      <button type="submit" name="action" value="approve">Approve</button>
      <button type="submit" name="action" value="deny">Deny</button>
    </form>
  </body>
</html>`;
    }
    function sendConsentPage(res, consentChallenge, pending) {
        for (const [name, value] of Object.entries(CONSENT_PAGE_HEADERS)) {
            res.setHeader(name, value);
        }
        res.status(200)
            .type("html")
            .send(renderConsentPage(consentChallenge, pending));
    }
    const provider = {
        clientsStore: {
            getClient(clientId) {
                return core.getClient(clientId);
            },
            registerClient(client) {
                return core.registerClient(client);
            },
        },
        async authorize(client, params, res) {
            const result = await core.startAuthorization(client, params);
            if (result.type === "redirect") {
                res.redirect(302, result.location);
                return;
            }
            sendConsentPage(res, result.consentChallenge, result.pending);
        },
        async challengeForAuthorizationCode(client, authorizationCode) {
            return await core.getAuthorizationCodeChallenge(client, authorizationCode);
        },
        async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri, resource) {
            return await core.exchangeAuthorizationCode(client, authorizationCode, redirectUri, resource);
        },
        async exchangeRefreshToken(client, refreshToken, scopes, resource) {
            return await core.exchangeRefreshToken(client, refreshToken, scopes, resource);
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
            const result = await core.approveConsent(consentChallenge, action ?? "");
            res.redirect(302, result.location);
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
            const result = await core.handleCallback({
                code: typeof req.query.code === "string" && req.query.code.length > 0 ? req.query.code : undefined,
                error: typeof req.query.error === "string" ? req.query.error : undefined,
                errorDescription: typeof req.query.error_description === "string" ? req.query.error_description : undefined,
                upstreamState,
            });
            res.redirect(302, result.location);
        }
        catch (error) {
            logAppEvent("oauth", "callback.failed", {
                ...getErrorDetails(error),
                path: req.path,
            });
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
