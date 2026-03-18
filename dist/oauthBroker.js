import crypto from "node:crypto";
import { InvalidRequestError, } from "@modelcontextprotocol/sdk/server/auth/errors.js";
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
            defaultScopes: config.scopes,
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
        verifyAccessToken: (token) => localTokenService.verifyAccessToken(token),
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
