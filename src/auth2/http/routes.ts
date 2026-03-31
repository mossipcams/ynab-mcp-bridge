import crypto from "node:crypto";

import type express from "express";

import { createAuthCore } from "../core/authCore.js";
import { createPkcePair } from "../core/pkce.js";
import type { AuthConfig } from "../config/schema.js";
import { logAuthEvent } from "../logging/authEvents.js";
import { createProviderAdapter } from "../provider/providerAdapter.js";
import { createInMemoryAuthStore } from "../store/authStore.js";
import type { RuntimeAuthConfig } from "../../config.js";

type InstallAuthV2RoutesContext = {
  app?: express.Express;
  auth?: RuntimeAuthConfig;
  auth2Config?: AuthConfig;
  path?: string;
};

function getSingleString(value: unknown) {
  return typeof value === "string" && value.length > 0
    ? value
    : undefined;
}

function writeOAuthError(
  res: express.Response,
  status: number,
  error: string,
  errorDescription: string,
) {
  res.status(status).json({
    error,
    error_description: errorDescription,
  });
}

function createRouteCore(config: AuthConfig) {
  const store = createInMemoryAuthStore();
  const provider = createProviderAdapter(config, fetch);
  const core = createAuthCore({
    config,
    createId: () => crypto.randomBytes(24).toString("base64url"),
    now: () => Date.now(),
    provider,
    store,
    upstreamPkce: {
      createPair: createPkcePair,
    },
  });

  return {
    core,
    store,
  };
}

export function installAuthV2Routes(context: InstallAuthV2RoutesContext) {
  if (!context.app) {
    throw new Error("auth2 route installation requires an Express app.");
  }

  if (context.auth?.mode !== "oauth") {
    throw new Error("auth2 route installation requires oauth auth mode.");
  }

  if (!context.auth2Config) {
    throw new Error("auth2Config is required for oauth route installation.");
  }

  if (!context.path) {
    throw new Error("auth2 route installation requires the MCP path.");
  }

  const protectedPathPrefix = `${context.path.replace(/\/$/, "")}/resources/`;
  const { core, store } = createRouteCore(context.auth2Config);

  context.app.use((req, res, next) => {
    const isProtectedRequest = req.path === context.path || req.path.startsWith(protectedPathPrefix);

    if (!isProtectedRequest) {
      next();
      return;
    }

    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      res.status(401).setHeader("www-authenticate", 'Bearer realm="mcp"').json({
        error: "invalid_token",
        error_description: "Missing bearer token.",
      });
      return;
    }

    const token = authorization.slice("Bearer ".length).trim();
    const accessToken = store.getAccessToken(token);

    if (!accessToken || accessToken.expiresAt <= Date.now()) {
      res.status(401).setHeader("www-authenticate", 'Bearer realm="mcp"').json({
        error: "invalid_token",
        error_description: "Bearer token is invalid or expired.",
      });
      return;
    }

    next();
  });

  context.app.get("/authorize", (req, res) => {
    try {
      const downstreamState = getSingleString(req.query["state"]);
      const requestedScopes = getSingleString(req.query["scope"])?.split(/\s+/).filter(Boolean);
      const result = core.startAuthorization({
        clientId: getSingleString(req.query["client_id"]) ?? "",
        codeChallenge: getSingleString(req.query["code_challenge"]) ?? "",
        codeChallengeMethod: getSingleString(req.query["code_challenge_method"]) ?? "",
        redirectUri: getSingleString(req.query["redirect_uri"]) ?? "",
        responseType: getSingleString(req.query["response_type"]) ?? "",
        ...(requestedScopes ? { scopes: requestedScopes } : {}),
        ...(downstreamState ? { state: downstreamState } : {}),
      });

      logAuthEvent("auth.http.authorize.redirected", {
        route: "/authorize",
        statusCode: 302,
        transactionId: result.transactionId,
      });
      res.redirect(302, result.redirectTo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeOAuthError(res, 400, "invalid_request", message);
    }
  });

  context.app.get("/oauth/callback", async (req, res) => {
    try {
      const code = getSingleString(req.query["code"]);
      const error = getSingleString(req.query["error"]);
      const errorDescription = getSingleString(req.query["error_description"]);
      const state = getSingleString(req.query["state"]);
      const result = await core.handleCallback({
        ...(code ? { code } : {}),
        ...(error ? { error } : {}),
        ...(errorDescription ? { errorDescription } : {}),
        ...(state ? { state } : {}),
      });

      res.redirect(302, result.redirectTo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeOAuthError(res, 400, "invalid_request", message);
    }
  });

  context.app.post("/token", async (req, res) => {
    try {
      const grantType = getSingleString(req.body?.["grant_type"]);
      const requestedScopes = getSingleString(req.body?.["scope"])?.split(/\s+/).filter(Boolean);

      if (grantType === "authorization_code") {
        const tokens = await core.exchangeAuthorizationCode({
          clientId: getSingleString(req.body?.["client_id"]) ?? "",
          code: getSingleString(req.body?.["code"]) ?? "",
          codeVerifier: getSingleString(req.body?.["code_verifier"]) ?? "",
          redirectUri: getSingleString(req.body?.["redirect_uri"]) ?? "",
        });

        res.status(200).json(tokens);
        return;
      }

      if (grantType === "refresh_token") {
        const tokens = await core.exchangeRefreshToken({
          clientId: getSingleString(req.body?.["client_id"]) ?? "",
          refreshToken: getSingleString(req.body?.["refresh_token"]) ?? "",
          ...(requestedScopes ? { scopes: requestedScopes } : {}),
        });

        res.status(200).json(tokens);
        return;
      }

      writeOAuthError(res, 400, "unsupported_grant_type", "grant_type is not supported.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeOAuthError(res, 400, "invalid_grant", message);
    }
  });

  return {
    installed: true as const,
    stack: "v2" as const,
  };
}
