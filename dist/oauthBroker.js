import crypto from "node:crypto";
import { SignJWT, createRemoteJWKSet, errors, jwtVerify } from "jose";
import { InvalidRequestError, InvalidTokenError, } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { createOAuthCore } from "./oauthCore.js";
import { createOAuthStore } from "./oauthStore.js";
import { createProviderClient } from "./providerClient.js";
const CONSENT_PAGE_HEADERS = {
    "cache-control": "no-store",
    pragma: "no-cache",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
};
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
function buildConsentPageHeaders(scriptNonce, formActionSources) {
    return {
        ...CONSENT_PAGE_HEADERS,
        "content-security-policy": `default-src 'none'; connect-src 'self'; script-src 'nonce-${scriptNonce}'; form-action ${formActionSources.join(" ")}; frame-ancestors 'none'; base-uri 'none'`,
    };
}
export async function createOAuthBroker(config) {
    const resourceUrl = new URL(config.publicUrl);
    const issuerUrl = new URL(resourceUrl.origin);
    const callbackUrl = new URL(config.callbackPath, issuerUrl).href;
    const providerClient = await createProviderClient({
        callbackUrl,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        issuer: config.issuer,
        ...(config.metadataMode === "explicit"
            ? {
                authorizationUrl: config.authorizationUrl,
                jwksUrl: config.jwksUrl,
                metadataMode: "explicit",
                tokenUrl: config.tokenUrl,
            }
            : {
                authorizationUrl: config.authorizationUrl,
                fallbackToExplicit: config.fallbackToExplicit,
                jwksUrl: config.jwksUrl,
                metadataMode: "discovery",
                tokenUrl: config.tokenUrl,
            }),
    });
    const providerMetadata = providerClient.getMetadata();
    const store = createOAuthStore(config.storePath);
    const localTokenSecret = Buffer.from(config.tokenSigningSecret ?? crypto.randomBytes(32).toString("base64url"), "utf8");
    const upstreamJwks = createRemoteJWKSet(new URL(providerMetadata.jwksUrl));
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
            issuer: providerMetadata.issuer,
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
    const core = createOAuthCore({
        config: {
            callbackUrl,
            defaultResource: config.publicUrl,
            defaultScopes: config.scopes,
        },
        dependencies: {
            createId: () => crypto.randomBytes(24).toString("base64url"),
            createUpstreamAuthorizationUrl: (pending) => providerClient.buildAuthorizationUrl(pending).href,
            exchangeUpstreamAuthorizationResponse: (response) => providerClient.exchangeAuthorizationCodeResponse(response),
            exchangeUpstreamRefreshToken: (refreshToken) => providerClient.exchangeRefreshToken(refreshToken),
            mintAccessToken,
            now: () => Date.now(),
        },
        store,
    });
    function renderConsentPage(consentChallenge, pending, scriptNonce) {
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
    <p>After you approve, this window may take a moment to continue.</p>
    <p id="consent-status" hidden>Continuing...</p>
    <form id="approve-form" method="post" action="/authorize/consent" data-action="approve">
      <input type="hidden" name="action" value="approve">
      <input type="hidden" name="consent_challenge" value="${escapedConsentChallenge}">
      <button id="approve-button" type="submit">Approve</button>
    </form>
    <form id="deny-form" method="post" action="/authorize/consent" data-action="deny">
      <input type="hidden" name="action" value="deny">
      <input type="hidden" name="consent_challenge" value="${escapedConsentChallenge}">
      <button id="deny-button" type="submit">Deny</button>
    </form>
    <script nonce="${scriptNonce}">
      const forms = document.querySelectorAll("form");
      const status = document.getElementById("consent-status");
      const approveButton = document.getElementById("approve-button");
      const denyButton = document.getElementById("deny-button");

      for (const form of forms) {
        if (!(form instanceof HTMLFormElement)) {
          continue;
        }

        form.addEventListener("submit", (event) => {
          if (document.body.dataset.submitted === "true") {
            event.preventDefault();
            return;
          }

          document.body.dataset.submitted = "true";

          if (approveButton instanceof HTMLButtonElement) {
            approveButton.disabled = true;
          }

          if (denyButton instanceof HTMLButtonElement) {
            denyButton.disabled = true;
          }

          const action = form.dataset.action === "deny" ? "deny" : "approve";

          if (action === "deny") {
            if (denyButton instanceof HTMLButtonElement) {
              denyButton.textContent = "Denying...";
            }
          } else if (approveButton instanceof HTMLButtonElement) {
            approveButton.textContent = "Continuing...";
          }

          if (status instanceof HTMLElement) {
            status.hidden = false;
          }
        });
      }
    </script>
  </body>
</html>`;
    }
    function sendConsentPage(res, consentChallenge, pending) {
        const scriptNonce = crypto.randomBytes(16).toString("base64url");
        const formActionSources = Array.from(new Set([
            "'self'",
            new URL(pending.redirectUri).origin,
            new URL(providerMetadata.authorizationUrl).origin,
        ]));
        for (const [name, value] of Object.entries(buildConsentPageHeaders(scriptNonce, formActionSources))) {
            res.setHeader(name, value);
        }
        res.status(200)
            .type("html")
            .send(renderConsentPage(consentChallenge, pending, scriptNonce));
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
            const result = await core.approveConsent(consentChallenge, action ?? "approve");
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
            const callbackRequestUrl = new URL(req.originalUrl || req.url || config.callbackPath, issuerUrl);
            const result = await core.handleCallback(providerClient.parseAuthorizationResponse(callbackRequestUrl));
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
