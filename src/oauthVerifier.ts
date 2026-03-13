import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from "jose";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";

type OAuthClaims = JWTPayload & {
  client_id?: string;
  scope?: string;
};

export type OAuthTokenVerifierConfig = {
  audience: string;
  issuer: string;
  jwks?: JWTVerifyGetKey;
  jwksUrl: string;
  scopes?: string[];
};

function parseScopes(scopeClaim: unknown) {
  if (typeof scopeClaim !== "string") {
    return [];
  }

  return scopeClaim
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function mapJwtError(error: unknown) {
  if (error instanceof InvalidTokenError) {
    return error;
  }

  if (error instanceof errors.JWTExpired) {
    return new InvalidTokenError("Token has expired.");
  }

  if (error instanceof errors.JWTClaimValidationFailed) {
    if (error.claim === "iss") {
      return new InvalidTokenError("Invalid token issuer.");
    }

    if (error.claim === "aud") {
      return new InvalidTokenError("Invalid token audience.");
    }
  }

  return new InvalidTokenError("Invalid access token.");
}

function toResourceUrl(audience: string) {
  try {
    return new URL(audience);
  } catch {
    return undefined;
  }
}

function getClientId(payload: OAuthClaims) {
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

export function createOAuthTokenVerifier(config: OAuthTokenVerifierConfig): OAuthTokenVerifier {
  const jwks = config.jwks ?? createRemoteJWKSet(new URL(config.jwksUrl));
  const requiredScopes = config.scopes ?? [];
  const resource = toResourceUrl(config.audience);

  return {
    async verifyAccessToken(token: string) {
      try {
        const { payload } = await jwtVerify<OAuthClaims>(token, jwks, {
          audience: config.audience,
          issuer: config.issuer,
        });
        const scopes = parseScopes(payload.scope);

        if (requiredScopes.length > 0 && !requiredScopes.every((scope) => scopes.includes(scope))) {
          throw new InvalidTokenError("Token is missing required scopes.");
        }

        return {
          clientId: getClientId(payload),
          expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
          extra: {
            subject: payload.sub,
          },
          resource,
          scopes,
          token,
        };
      } catch (error) {
        throw mapJwtError(error);
      }
    },
  };
}
