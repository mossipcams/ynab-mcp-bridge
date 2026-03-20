import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
function parseScopes(scopeClaim) {
    if (typeof scopeClaim !== "string") {
        return [];
    }
    return scopeClaim
        .split(/\s+/)
        .map((scope) => scope.trim())
        .filter(Boolean);
}
function mapJwtError(error) {
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
function toResourceUrl(audience) {
    try {
        return new URL(audience);
    }
    catch {
        return undefined;
    }
}
function getClientId(payload) {
    if (typeof payload.client_id === "string" && payload.client_id.length > 0) {
        return payload.client_id;
    }
    if (typeof payload["azp"] === "string" && payload["azp"].length > 0) {
        return payload["azp"];
    }
    if (typeof payload.sub === "string" && payload.sub.length > 0) {
        return payload.sub;
    }
    throw new InvalidTokenError("Token is missing a client identifier.");
}
export function createOAuthTokenVerifier(config) {
    const jwks = config.jwks ?? createRemoteJWKSet(new URL(config.jwksUrl));
    const requiredScopes = config.scopes ?? [];
    const resource = toResourceUrl(config.audience);
    return {
        async verifyAccessToken(token) {
            try {
                const { payload } = await jwtVerify(token, jwks, {
                    audience: config.audience,
                    issuer: config.issuer,
                });
                const scopes = parseScopes(payload.scope);
                if (requiredScopes.length > 0 && !requiredScopes.every((scope) => scopes.includes(scope))) {
                    throw new InvalidTokenError("Token is missing required scopes.");
                }
                return {
                    clientId: getClientId(payload),
                    ...(typeof payload.exp === "number" ? { expiresAt: payload.exp } : {}),
                    extra: {
                        ...(typeof payload.sub === "string" ? { subject: payload.sub } : {}),
                    },
                    ...(resource ? { resource } : {}),
                    scopes,
                    token,
                };
            }
            catch (error) {
                throw mapJwtError(error);
            }
        },
    };
}
