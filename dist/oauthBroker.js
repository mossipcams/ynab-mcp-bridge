import crypto from "node:crypto";
import { InvalidRequestError, } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { getEffectiveOAuthScopes } from "./config.js";
import { createLocalTokenService } from "./localTokenService.js";
import { createOAuthCore } from "./oauthCore.js";
import { createOAuthStore } from "./oauthStore.js";
import { createUpstreamOAuthAdapter } from "./upstreamOAuthAdapter.js";
const CONSENT_PAGE_HEADERS = {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    pragma: "no-cache",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
};
function logOAuthDebug(event, details) {
    console.error("[oauth]", event, details);
}
function getErrorDetails(error) {
    if (error instanceof Error) {
        const upstreamError = "upstreamError" in error && typeof error.upstreamError === "string"
            ? error.upstreamError
            : undefined;
        const upstreamErrorDescription = "upstreamErrorDescription" in error && typeof error.upstreamErrorDescription === "string"
            ? error.upstreamErrorDescription
            : undefined;
        const upstreamErrorFields = "upstreamErrorFields" in error &&
            Array.isArray(error.upstreamErrorFields) &&
            error.upstreamErrorFields.every((field) => typeof field === "string")
            ? error.upstreamErrorFields
            : undefined;
        return {
            errorMessage: error.message,
            errorName: error.name,
            upstreamError,
            upstreamErrorDescription,
            upstreamErrorFields,
        };
    }
    return {
        errorMessage: String(error),
        errorName: "UnknownError",
    };
}
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}
function getTokenResponseDebugDetails(tokens) {
    return {
        hasAccessToken: typeof tokens.access_token === "string" && tokens.access_token.length > 0,
        hasExpiresIn: typeof tokens.expires_in === "number",
        hasRefreshToken: typeof tokens.refresh_token === "string" && tokens.refresh_token.length > 0,
        hasScope: typeof tokens.scope === "string" && tokens.scope.length > 0,
        hasTokenType: typeof tokens.token_type === "string" && tokens.token_type.length > 0,
        tokenResponseFields: Object.keys(tokens).sort(),
    };
}
function getBodyStringValue(body, key) {
    if (!body || typeof body !== "object") {
        return undefined;
    }
    const value = body[key];
    return typeof value === "string" ? value : undefined;
}
export function createOAuthBroker(config) {
    const store = createOAuthStore(config.storePath);
    const resourceUrl = new URL(config.publicUrl);
    const issuerUrl = new URL(resourceUrl.origin);
    const callbackUrl = new URL(config.callbackPath, issuerUrl).href;
    const effectiveScopes = getEffectiveOAuthScopes(config.scopes);
    const localTokenSecret = Buffer.from(config.tokenSigningSecret ?? crypto.randomBytes(32).toString("base64url"), "utf8");
    const allowedAudiences = Array.from(new Set([config.audience, config.publicUrl]));
    const localTokenService = createLocalTokenService({
        allowedAudiences,
        issuer: issuerUrl.href,
        tokenSecret: localTokenSecret,
    });
    async function mintAccessToken(record) {
        return await localTokenService.mintAccessToken({
            clientId: record.clientId,
            expiresInSeconds: record.expiresInSeconds,
            resource: record.resource,
            scopes: record.scopes,
            subject: record.principalId,
        });
    }
    const upstreamAdapter = createUpstreamOAuthAdapter({
        authorizationUrl: config.authorizationUrl,
        callbackUrl,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        tokenUrl: config.tokenUrl,
    });
    const core = createOAuthCore({
        config: {
            callbackUrl,
            defaultResource: config.publicUrl,
            defaultScopes: effectiveScopes,
        },
        dependencies: {
            createId: () => crypto.randomBytes(24).toString("base64url"),
            createUpstreamAuthorizationUrl: (pending) => upstreamAdapter.buildAuthorizationUrl(pending).href,
            exchangeUpstreamAuthorizationCode: (code) => upstreamAdapter.exchangeAuthorizationCode(code),
            exchangeUpstreamRefreshToken: (refreshToken) => upstreamAdapter.exchangeRefreshToken(refreshToken),
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
            logOAuthDebug("authorize.started", {
                clientId: client.client_id,
                hasRedirectUri: typeof params.redirectUri === "string" && params.redirectUri.length > 0,
                hasResource: Boolean(params.resource?.href),
                hasState: typeof params.state === "string" && params.state.length > 0,
                scopeCount: params.scopes?.length ?? effectiveScopes.length,
            });
            try {
                const result = await core.startAuthorization(client, params);
                if (result.type === "redirect") {
                    logOAuthDebug("authorize.redirected", {
                        clientId: client.client_id,
                        requiresConsent: false,
                    });
                    res.redirect(302, result.location);
                    return;
                }
                logOAuthDebug("authorize.consent_required", {
                    clientId: client.client_id,
                    consentChallengeIssued: true,
                    scopeCount: result.pending.scopes.length,
                });
                sendConsentPage(res, result.consentChallenge, result.pending);
            }
            catch (error) {
                logOAuthDebug("authorize.failed", {
                    clientId: client.client_id,
                    ...getErrorDetails(error),
                });
                throw error;
            }
        },
        async challengeForAuthorizationCode(client, authorizationCode) {
            return await core.getAuthorizationCodeChallenge(client, authorizationCode);
        },
        async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri, resource) {
            try {
                const tokens = await core.exchangeAuthorizationCode(client, authorizationCode, redirectUri, resource);
                logOAuthDebug("token.exchange.succeeded", {
                    clientId: client.client_id,
                    grantType: "authorization_code",
                    hasRedirectUri: typeof redirectUri === "string" && redirectUri.length > 0,
                    hasResource: Boolean(resource?.href),
                    issuedAccessToken: typeof tokens.access_token === "string" && tokens.access_token.length > 0,
                    issuedRefreshToken: typeof tokens.refresh_token === "string" && tokens.refresh_token.length > 0,
                    scopeCount: tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean).length : 0,
                    ...getTokenResponseDebugDetails(tokens),
                });
                return tokens;
            }
            catch (error) {
                logOAuthDebug("token.exchange.failed", {
                    clientId: client.client_id,
                    grantType: "authorization_code",
                    hasRedirectUri: typeof redirectUri === "string" && redirectUri.length > 0,
                    hasResource: Boolean(resource?.href),
                    ...getErrorDetails(error),
                });
                throw error;
            }
        },
        async exchangeRefreshToken(client, refreshToken, scopes, resource) {
            try {
                const tokens = await core.exchangeRefreshToken(client, refreshToken, scopes, resource);
                logOAuthDebug("token.refresh.succeeded", {
                    clientId: client.client_id,
                    grantType: "refresh_token",
                    hasResource: Boolean(resource?.href),
                    issuedAccessToken: typeof tokens.access_token === "string" && tokens.access_token.length > 0,
                    issuedRefreshToken: typeof tokens.refresh_token === "string" && tokens.refresh_token.length > 0,
                    scopeCount: tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean).length : 0,
                    ...getTokenResponseDebugDetails(tokens),
                });
                return tokens;
            }
            catch (error) {
                logOAuthDebug("token.refresh.failed", {
                    clientId: client.client_id,
                    grantType: "refresh_token",
                    hasRefreshToken: typeof refreshToken === "string" && refreshToken.length > 0,
                    hasResource: Boolean(resource?.href),
                    scopeCount: scopes?.length ?? 0,
                    ...getErrorDetails(error),
                });
                throw error;
            }
        },
        verifyAccessToken: (token) => localTokenService.verifyAccessToken(token),
    };
    const handleConsent = async (req, res, next) => {
        try {
            const consentChallenge = getBodyStringValue(req.body, "consent_challenge");
            const action = getBodyStringValue(req.body, "action");
            logOAuthDebug("consent.received", {
                action,
                hasConsentChallenge: Boolean(consentChallenge),
            });
            if (!consentChallenge) {
                throw new InvalidRequestError("Missing consent challenge.");
            }
            const result = await core.approveConsent(consentChallenge, action ?? "");
            logOAuthDebug("consent.resolved", {
                action: action ?? "",
                redirected: result.type === "redirect",
            });
            res.redirect(302, result.location);
        }
        catch (error) {
            logOAuthDebug("consent.failed", getErrorDetails(error));
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
            const hasCode = typeof req.query.code === "string" && req.query.code.length > 0;
            const hasError = typeof req.query.error === "string";
            const hasState = typeof upstreamState === "string" && upstreamState.length > 0;
            logOAuthDebug("callback.received", {
                hasCode,
                hasError,
                hasState,
            });
            if (!upstreamState) {
                throw new InvalidRequestError("Missing upstream OAuth state.");
            }
            const result = await core.handleCallback({
                code: typeof req.query.code === "string" && req.query.code.length > 0 ? req.query.code : undefined,
                error: typeof req.query.error === "string" ? req.query.error : undefined,
                errorDescription: typeof req.query.error_description === "string" ? req.query.error_description : undefined,
                upstreamState,
            });
            logOAuthDebug("callback.completed", {
                hasCode,
                hasError,
                hasState,
                issuedAuthorizationCode: result.type === "redirect",
            });
            res.redirect(302, result.location);
        }
        catch (error) {
            logOAuthDebug("callback.failed", getErrorDetails(error));
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
