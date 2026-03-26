import { type RequestHandler } from "express";

import type { RuntimeAuthConfig } from "./config.js";
import { getFirstHeaderValue } from "./headerUtils.js";
import { createLocalTokenService } from "./localTokenService.js";
import { createOAuthTokenVerifier } from "./oauthVerifier.js";

type OAuthAuthConfig = Extract<RuntimeAuthConfig, { mode: "oauth" }>;

const CF_ACCESS_AUTHORIZATION_SOURCE_HEADER = "x-mcp-cf-access-authorization-source";

function clampExpiresIn(expiresAtSeconds: number | undefined) {
  if (expiresAtSeconds === undefined) {
    return 3600;
  }

  const secondsRemaining = expiresAtSeconds - Math.floor(Date.now() / 1000);
  return Math.max(60, Math.min(secondsRemaining, 3600));
}

export function createCloudflareAccessCompatibilityMiddleware(config: OAuthAuthConfig): RequestHandler {
  if (!config.tokenSigningSecret) {
    throw new Error("OAuth token signing secret is required for Cloudflare compatibility.");
  }

  const issuer = new URL(new URL(config.publicUrl).origin).href;
  const localTokenService = createLocalTokenService({
    allowedAudiences: Array.from(new Set([config.audience, config.publicUrl])),
    issuer,
    tokenSecret: Buffer.from(config.tokenSigningSecret, "utf8"),
  });
  const upstreamVerifier = createOAuthTokenVerifier({
    audience: config.audience,
    issuer: config.issuer,
    jwksUrl: config.jwksUrl,
  });

  return async (req, _res, next) => {
    const existingAuthorization = getFirstHeaderValue(req.headers.authorization);

    if (existingAuthorization) {
      next();
      return;
    }

    const assertion = getFirstHeaderValue(req.headers["cf-access-jwt-assertion"]);

    if (!assertion) {
      next();
      return;
    }

    try {
      const upstreamAuth = await upstreamVerifier.verifyAccessToken(assertion);
      const subject = typeof upstreamAuth.extra?.["subject"] === "string"
        ? upstreamAuth.extra["subject"]
        : upstreamAuth.clientId;
      const localToken = await localTokenService.mintAccessToken({
        clientId: upstreamAuth.clientId,
        expiresInSeconds: clampExpiresIn(upstreamAuth.expiresAt),
        resource: config.publicUrl,
        scopes: upstreamAuth.scopes,
        subject,
      });

      req.headers.authorization = `Bearer ${localToken}`;
      req.headers[CF_ACCESS_AUTHORIZATION_SOURCE_HEADER] = "cf-access-jwt-assertion";
    } catch {
      // Leave the request unauthenticated so the normal bearer challenge is returned.
    }

    next();
  };
}
