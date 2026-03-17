import { SignJWT, createRemoteJWKSet, decodeJwt, errors, jwtVerify } from "jose";
import { InvalidTokenError, } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { getFirstHeaderValue } from "./originPolicy.js";
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
export function createJwtService(config) {
    const upstreamJwks = createRemoteJWKSet(new URL(config.upstreamJwksUrl));
    async function verifyLocalAccessToken(token) {
        const { payload } = await jwtVerify(token, config.localTokenSecret, {
            audience: config.allowedAudiences,
            issuer: config.issuerUrl.href,
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
            audience: config.upstreamAudience,
            issuer: config.upstreamIssuer,
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
            .setIssuer(config.issuerUrl.href)
            .setAudience(record.resource)
            .setExpirationTime(`${record.expiresInSeconds}s`)
            .setSubject(record.subject)
            .sign(config.localTokenSecret);
    }
    return { mintAccessToken, verifyAccessToken };
}
const CF_ACCESS_AUTHORIZATION_SOURCE_HEADER = "x-mcp-cf-access-authorization-source";
function getBearerToken(authorizationHeader) {
    if (!authorizationHeader?.startsWith("Bearer ")) {
        return undefined;
    }
    return authorizationHeader.slice("Bearer ".length).trim();
}
export function isDirectUpstreamBearerToken(req, auth) {
    const authorizationSource = getFirstHeaderValue(req.headers[CF_ACCESS_AUTHORIZATION_SOURCE_HEADER]);
    if (authorizationSource === "cf-access-jwt-assertion") {
        return false;
    }
    const token = getBearerToken(getFirstHeaderValue(req.headers.authorization));
    if (!token) {
        return false;
    }
    try {
        return decodeJwt(token).iss === auth.issuer;
    }
    catch {
        return false;
    }
}
