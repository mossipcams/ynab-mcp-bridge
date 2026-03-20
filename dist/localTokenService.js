import { SignJWT, jwtVerify } from "jose";
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
export function createLocalTokenService(options) {
    const tokenSecret = typeof options.tokenSecret === "string"
        ? Buffer.from(options.tokenSecret, "utf8")
        : options.tokenSecret;
    return {
        async mintAccessToken(record) {
            return await new SignJWT({
                client_id: record.clientId,
                scope: record.scopes.join(" "),
            })
                .setProtectedHeader({
                alg: "HS256",
                typ: "JWT",
            })
                .setIssuedAt()
                .setIssuer(options.issuer)
                .setAudience(record.resource)
                .setExpirationTime(`${record.expiresInSeconds}s`)
                .setSubject(record.subject)
                .sign(tokenSecret);
        },
        async verifyAccessToken(token) {
            const { payload } = await jwtVerify(token, tokenSecret, {
                audience: options.allowedAudiences,
                issuer: options.issuer,
            });
            const resource = getAudienceValue(payload) ?? options.allowedAudiences[0];
            if (!resource) {
                throw new InvalidTokenError("Token is missing a valid audience.");
            }
            return {
                clientId: getClientId(payload),
                ...(typeof payload.exp === "number" ? { expiresAt: payload.exp } : {}),
                extra: {
                    ...(typeof payload.sub === "string" ? { subject: payload.sub } : {}),
                },
                resource: new URL(resource),
                scopes: parseScopes(payload.scope),
                token,
            };
        },
    };
}
