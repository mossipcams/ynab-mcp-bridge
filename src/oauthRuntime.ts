/**
 * Owns: OpenID/protected-resource metadata, bearer-auth middleware wiring, OAuth HTTP route registration hooks, consent-page handling, provider callbacks, token exchange orchestration, and OAuth event logging.
 * Inputs/dependencies: OAuth auth config, grantLifecycle, grantPersistence, upstream OAuth adapter, local token service, Cloudflare compatibility middleware, and clientProfiles/.
 * Outputs/contracts: createMcpAuthModule(...), createOAuthBroker(...), and OAuth runtime helpers consumed by HTTP transport wiring.
 */
import crypto from "node:crypto";

import express, { type RequestHandler } from "express";
import {
  InvalidRequestError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import type { OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { createOAuthMetadata, getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

import { getEffectiveOAuthScopes, type RuntimeAuthConfig } from "./config.js";
import type { ClientProfileId, DetectedClientProfile } from "./clientProfiles/types.js";
import { getResolvedClientProfile, setResolvedClientProfile } from "./clientProfiles/profileContext.js";
import { logClientProfileEvent } from "./clientProfiles/profileLogger.js";
import { createLocalTokenService } from "./localTokenService.js";
import { logAppEvent } from "./logger.js";
import { createOAuthCore, type PendingConsent } from "./grantLifecycle.js";
import { createOAuthStore } from "./grantPersistence.js";
import { getRequestLogFields } from "./requestContext.js";
import { getStringValue, isRecord } from "./typeUtils.js";
import { createUpstreamOAuthAdapter } from "./upstreamOAuthAdapter.js";

type OAuthAuthConfig = Extract<RuntimeAuthConfig, { mode: "oauth" }>;
type AuthDebugOptions = {
  authMode?: "http" | "stdio" | "oauth" | "none";
  authRequired?: boolean;
};

type InstallOAuthRoutesOptions = {
  app: express.Express;
  auth: OAuthAuthConfig;
  cloudflareCompatibilityMiddleware: RequestHandler;
  getCanonicalOAuthDiscoveryPath: (pathname: string, profileId: ClientProfileId) => string | undefined;
  getPersistedOAuthProfileReason: (profileId: ClientProfileId) => string;
  getRequestAuthDebugOptions: (req: Pick<express.Request, "path" | "url">) => AuthDebugOptions;
  getRequestDebugDetails: (req: express.Request, options?: AuthDebugOptions) => Record<string, unknown>;
  getRequestPath: (req: Pick<express.Request, "path" | "url">) => string;
  isDirectUpstreamBearerToken: (req: Pick<express.Request, "headers">, auth: OAuthAuthConfig) => boolean;
  jsonParser: RequestHandler;
  logHttpDebug: (event: string, details: Record<string, unknown>) => void;
  mcpAuthModule: ReturnType<typeof createMcpAuthModule>;
  path: string;
};

function getConsentPageHeaders(authorizationUrl: string) {
  const authorizationOrigin = new URL(authorizationUrl).origin;

  return {
    "cache-control": "no-store",
    "content-security-policy": `default-src 'none'; form-action 'self' ${authorizationOrigin}; frame-ancestors 'none'; base-uri 'none'`,
    pragma: "no-cache",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  } as const;
}

function logOAuthDebug(event: string, details: Record<string, unknown>) {
  logAppEvent("oauth", event, {
    ...getRequestLogFields(),
    ...details,
  });
}

function getErrorDetails(error: unknown) {
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

function createMissingUpstreamStateError(error: string | undefined, errorDescription: string | undefined) {
  if (!error) {
    return new InvalidRequestError("Missing upstream OAuth state.");
  }

  const message = errorDescription
    ? `Upstream OAuth callback returned error "${error}" without state. ${errorDescription}`
    : `Upstream OAuth callback returned error "${error}" without state.`;

  return Object.assign(new InvalidRequestError(message), {
    upstreamError: error,
    upstreamErrorDescription: errorDescription,
    upstreamErrorFields: errorDescription === undefined
      ? ["error"]
      : ["error", "error_description"],
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function getTokenResponseDebugDetails(tokens: OAuthTokens) {
  return {
    hasAccessToken: typeof tokens.access_token === "string" && tokens.access_token.length > 0,
    hasExpiresIn: typeof tokens.expires_in === "number",
    hasRefreshToken: typeof tokens.refresh_token === "string" && tokens.refresh_token.length > 0,
    hasScope: typeof tokens.scope === "string" && tokens.scope.length > 0,
    hasTokenType: typeof tokens.token_type === "string" && tokens.token_type.length > 0,
    tokenResponseFields: Object.keys(tokens).sort(),
  };
}

function getBodyStringValue(body: unknown, key: string) {
  if (!isRecord(body)) {
    return undefined;
  }

  return getStringValue(body, key);
}

export function createOAuthBroker(config: OAuthAuthConfig): {
  callbackPath: string;
  callbackUrl: string;
  getClientCompatibilityProfile: (clientId: string) => ReturnType<typeof core.getClientCompatibilityProfile>;
  getIssuerUrl: () => URL;
  handleConsent: RequestHandler;
  provider: OAuthServerProvider;
  handleCallback: RequestHandler;
} {
  const store = createOAuthStore(config.storePath);
  const resourceUrl = new URL(config.publicUrl);
  const issuerUrl = new URL(resourceUrl.origin);
  const callbackUrl = new URL(config.callbackPath, issuerUrl).href;
  const consentPageHeaders = getConsentPageHeaders(config.authorizationUrl);
  const effectiveScopes = getEffectiveOAuthScopes(config.scopes);
  const localTokenSecret = Buffer.from(config.tokenSigningSecret ?? crypto.randomBytes(32).toString("base64url"), "utf8");
  const allowedAudiences = Array.from(new Set([config.audience, config.publicUrl]));
  const localTokenService = createLocalTokenService({
    allowedAudiences,
    issuer: issuerUrl.href,
    tokenSecret: localTokenSecret,
  });

  async function mintAccessToken(record: {
    clientId: string;
    expiresInSeconds: number;
    principalId: string;
    resource: string;
    scopes: string[];
  }) {
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

  function renderConsentPage(consentChallenge: string, pending: PendingConsent) {
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

  function sendConsentPage(res: Parameters<RequestHandler>[1], consentChallenge: string, pending: PendingConsent) {
    for (const [name, value] of Object.entries(consentPageHeaders)) {
      res.setHeader(name, value);
    }

    res.status(200)
      .type("html")
      .send(renderConsentPage(consentChallenge, pending));
  }

  const provider: OAuthServerProvider = {
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
      } catch (error) {
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
      } catch (error) {
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
      } catch (error) {
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

  const handleConsent: RequestHandler = async (req, res, next) => {
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
    } catch (error) {
      logOAuthDebug("consent.failed", getErrorDetails(error));
      if (error instanceof InvalidRequestError) {
        res.status(400).json(error.toResponseObject());
        return;
      }

      next(error);
    }
  };

  const handleCallback: RequestHandler = async (req, res, next) => {
    try {
      const upstreamState = typeof req.query["state"] === "string" ? req.query["state"] : undefined;
      const upstreamError = typeof req.query["error"] === "string" ? req.query["error"] : undefined;
      const upstreamErrorDescription = typeof req.query["error_description"] === "string"
        ? req.query["error_description"]
        : undefined;
      const hasCode = typeof req.query["code"] === "string" && req.query["code"].length > 0;
      const hasError = typeof upstreamError === "string";
      const hasState = typeof upstreamState === "string" && upstreamState.length > 0;

      logOAuthDebug("callback.received", {
        hasCode,
        hasError,
        hasState,
      });

      if (!upstreamState) {
        throw createMissingUpstreamStateError(upstreamError, upstreamErrorDescription);
      }

      const result = await core.handleCallback({
        code: typeof req.query["code"] === "string" && req.query["code"].length > 0 ? req.query["code"] : undefined,
        error: upstreamError,
        errorDescription: upstreamErrorDescription,
        upstreamState,
      });
      logOAuthDebug("callback.completed", {
        hasCode,
        hasError,
        hasState,
        issuedAuthorizationCode: result.type === "redirect",
      });
      res.redirect(302, result.location);
    } catch (error) {
      logAppEvent("oauth", "callback.failed", {
        ...getRequestLogFields(),
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
    getClientCompatibilityProfile: core.getClientCompatibilityProfile,
    getIssuerUrl: () => new URL(issuerUrl.href),
    handleConsent,
    provider,
    handleCallback,
  };
}

function getOpenIdConfiguration(
  auth: OAuthAuthConfig,
  oauthBroker: ReturnType<typeof createOAuthBroker>,
) {
  const scopesSupported = getEffectiveOAuthScopes(auth.scopes);
  const oauthMetadata = createOAuthMetadata({
    issuerUrl: oauthBroker.getIssuerUrl(),
    provider: oauthBroker.provider,
    scopesSupported,
  });

  return {
    authorization_endpoint: oauthMetadata.authorization_endpoint,
    code_challenge_methods_supported: oauthMetadata.code_challenge_methods_supported,
    grant_types_supported: oauthMetadata.grant_types_supported,
    issuer: oauthMetadata.issuer,
    registration_endpoint: oauthMetadata.registration_endpoint,
    response_types_supported: oauthMetadata.response_types_supported,
    scopes_supported: oauthMetadata.scopes_supported,
    subject_types_supported: ["public"],
    token_endpoint: oauthMetadata.token_endpoint,
    token_endpoint_auth_methods_supported: oauthMetadata.token_endpoint_auth_methods_supported,
  };
}

export function createMcpAuthModule(auth: OAuthAuthConfig) {
  const oauthBroker = createOAuthBroker(auth);
  const publicServerUrl = new URL(auth.publicUrl);
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(publicServerUrl);
  const scopesSupported = getEffectiveOAuthScopes(auth.scopes);
  const router = express.Router();

  router.use(oauthBroker.callbackPath, oauthBroker.handleCallback);
  router.post("/authorize/consent", express.urlencoded({ extended: false }), oauthBroker.handleConsent);
  router.get("/.well-known/openid-configuration", (_req, res) => {
    res.status(200).json(getOpenIdConfiguration(auth, oauthBroker));
  });
  router.use(mcpAuthRouter({
    baseUrl: oauthBroker.getIssuerUrl(),
    issuerUrl: oauthBroker.getIssuerUrl(),
    provider: oauthBroker.provider,
    resourceName: "YNAB MCP Bridge",
    resourceServerUrl: publicServerUrl,
    scopesSupported,
  }));

  return {
    authMiddleware: requireBearerAuth({
      requiredScopes: scopesSupported,
      resourceMetadataUrl,
      verifier: oauthBroker.provider,
    }),
    getClientCompatibilityProfile: oauthBroker.getClientCompatibilityProfile,
    protectedResourceMetadata: {
      authorization_servers: [oauthBroker.getIssuerUrl().href],
      resource: publicServerUrl.href,
      resource_name: "YNAB MCP Bridge",
      scopes_supported: scopesSupported.length > 0 ? scopesSupported : undefined,
    },
    router,
  };
}

export function installOAuthRoutes(options: InstallOAuthRoutesOptions) {
  const {
    app,
    auth,
    cloudflareCompatibilityMiddleware,
    getCanonicalOAuthDiscoveryPath,
    getPersistedOAuthProfileReason,
    getRequestAuthDebugOptions,
    getRequestDebugDetails,
    getRequestPath,
    isDirectUpstreamBearerToken,
    jsonParser,
    logHttpDebug,
    mcpAuthModule,
    path,
  } = options;

  app.get("/.well-known/oauth-protected-resource", (req, res, next) => {
    const resolvedProfile = getResolvedClientProfile(res.locals);

    if (resolvedProfile?.profileId !== "chatgpt") {
      next();
      return;
    }

    res.status(200).json(mcpAuthModule.protectedResourceMetadata);
  });

  app.use((req, res, next) => {
    const resolvedProfile = getResolvedClientProfile(res.locals);
    const canonicalPath = getCanonicalOAuthDiscoveryPath(
      getRequestPath(req),
      resolvedProfile?.profileId ?? "generic",
    );

    if (canonicalPath) {
      req.url = canonicalPath;
    }

    next();
  });

  app.use(mcpAuthModule.router);

  app.use((req, res, next) => {
    if (getRequestPath(req) === path && req.method === "POST") {
      cloudflareCompatibilityMiddleware(req, res, (error?: unknown) => {
        if (error) {
          next(error);
          return;
        }

        jsonParser(req, res, next);
      });
      return;
    }

    next();
  });

  app.use((req, res, next) => {
    if (getRequestPath(req) !== path || req.method !== "POST") {
      next();
      return;
    }

    if (isDirectUpstreamBearerToken(req, auth)) {
      delete req.headers.authorization;
    }

    res.once("finish", () => {
      if (req.auth || (res.statusCode !== 401 && res.statusCode !== 403)) {
        return;
      }

      logHttpDebug("request.rejected", {
        ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
        reason: res.statusCode === 401 ? "unauthorized" : "forbidden-scope",
      });
    });

    mcpAuthModule.authMiddleware(req, res, next);
  });

  app.use((req, res, next) => {
    if (getRequestPath(req) !== path || req.method !== "POST" || !req.auth?.clientId) {
      next();
      return;
    }

    const persistedProfileId = mcpAuthModule.getClientCompatibilityProfile(req.auth.clientId);

    if (!persistedProfileId) {
      next();
      return;
    }

    const persistedProfile: DetectedClientProfile = {
      profileId: persistedProfileId,
      reason: getPersistedOAuthProfileReason(persistedProfileId),
    };
    const resolvedProfile = getResolvedClientProfile(res.locals);

    if (
      resolvedProfile?.profileId !== persistedProfile.profileId ||
      resolvedProfile.reason !== persistedProfile.reason
    ) {
      setResolvedClientProfile(res.locals, persistedProfile);
      logClientProfileEvent("profile.detected", {
        method: req.method ?? "GET",
        path: getRequestPath(req),
        profileId: persistedProfile.profileId,
        reason: persistedProfile.reason,
      });
    }

    next();
  });
}
