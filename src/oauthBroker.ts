import crypto from "node:crypto";

import type { RequestHandler } from "express";
import {
  InvalidRequestError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";

import { validateCloudflareAccessOAuthSettings, type RuntimeAuthConfig } from "./config.js";
import { CONSENT_PATH, sendConsentPage } from "./oauthConsentPage.js";
import { createOAuthCore } from "./oauthCore.js";
import { createJwtService } from "./oauthJwt.js";
import { createOAuthStore } from "./oauthStore.js";
import { createUpstreamClient } from "./oauthUpstream.js";

type OAuthAuthConfig = Extract<RuntimeAuthConfig, { mode: "oauth" }>;

export { CONSENT_PATH };

export function createOAuthBroker(config: OAuthAuthConfig): {
  callbackPath: string;
  callbackUrl: string;
  getIssuerUrl: () => URL;
  handleConsent: RequestHandler;
  provider: OAuthServerProvider;
  handleCallback: RequestHandler;
} {
  validateCloudflareAccessOAuthSettings({
    authorizationUrl: config.authorizationUrl,
    issuer: config.issuer,
    jwksUrl: config.jwksUrl,
    tokenUrl: config.tokenUrl,
  });

  const store = createOAuthStore(config.storePath);
  const resourceUrl = new URL(config.publicUrl);
  const issuerUrl = new URL(resourceUrl.origin);
  const callbackUrl = new URL(config.callbackPath, issuerUrl).href;
  const localTokenSecret = Buffer.from(config.tokenSigningSecret ?? crypto.randomBytes(32).toString("base64url"), "utf8");
  const allowedAudiences = Array.from(new Set([config.audience, config.publicUrl]));

  const jwtService = createJwtService({
    allowedAudiences,
    issuerUrl,
    localTokenSecret,
    publicUrl: config.publicUrl,
    upstreamAudience: config.audience,
    upstreamIssuer: config.issuer,
    upstreamJwksUrl: config.jwksUrl,
  });

  const upstream = createUpstreamClient({
    authorizationUrl: config.authorizationUrl,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    tokenUrl: config.tokenUrl,
  }, callbackUrl);

  const core = createOAuthCore({
    config: {
      callbackUrl,
      defaultResource: config.publicUrl,
      defaultScopes: config.scopes,
    },
    dependencies: {
      createId: () => crypto.randomBytes(24).toString("base64url"),
      createUpstreamAuthorizationUrl: (pending) => upstream.buildUpstreamAuthorizationUrl(pending).href,
      exchangeUpstreamAuthorizationCode: upstream.exchangeUpstreamAuthorizationCode,
      exchangeUpstreamRefreshToken: upstream.exchangeUpstreamRefreshToken,
      mintAccessToken: jwtService.mintAccessToken,
      now: () => Date.now(),
    },
    store,
  });

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
      const result = await core.startAuthorization(client, params);

      if (result.type === "redirect") {
        res.redirect(302, result.location);
        return;
      }

      sendConsentPage(res, result.consentChallenge, result.pending, config.authorizationUrl);
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
    verifyAccessToken: jwtService.verifyAccessToken,
  };

  const handleConsent: RequestHandler = async (req, res, next) => {
    try {
      const consentChallenge = typeof req.body?.consent_challenge === "string" ? req.body.consent_challenge : undefined;
      const action = typeof req.body?.action === "string" ? req.body.action : undefined;

      if (!consentChallenge) {
        throw new InvalidRequestError("Missing consent challenge.");
      }

      const result = await core.approveConsent(consentChallenge, action ?? "approve");
      res.redirect(302, result.location);
    } catch (error) {
      if (error instanceof InvalidRequestError) {
        res.status(400).json(error.toResponseObject());
        return;
      }

      next(error);
    }
  };

  const handleCallback: RequestHandler = async (req, res, next) => {
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
    } catch (error) {
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
