import { createHash } from "node:crypto";
import { z } from "zod/v4";
const authClientSchema = z.strictObject({
    clientId: z.string().min(1),
    displayName: z.string().min(1).optional(),
    providerId: z.string().min(1),
    redirectUri: z.url(),
    scopes: z.array(z.string().min(1)).min(1),
});
const authProviderSchema = z.strictObject({
    authorizationEndpoint: z.url(),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1).optional(),
    issuer: z.url(),
    jwksUri: z.url().optional(),
    tokenEndpoint: z.url(),
    usePkce: z.literal(true),
});
const authConfigSchema = z.strictObject({
    accessTokenTtlSec: z.number().int().positive(),
    authCodeTtlSec: z.number().int().positive(),
    callbackPath: z.literal("/oauth/callback"),
    clients: z.array(authClientSchema).min(1),
    provider: authProviderSchema,
    publicBaseUrl: z.url(),
    refreshTokenTtlSec: z.number().int().positive(),
});
function fingerprintRedirectUri(value) {
    return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
function assertUniqueClientIds(clients) {
    const seen = new Set();
    for (const client of clients) {
        if (seen.has(client.clientId)) {
            throw new Error(`OAuth client IDs must be unique. Duplicate client_id: ${client.clientId}`);
        }
        seen.add(client.clientId);
    }
}
export function parseAuthConfig(input) {
    const config = authConfigSchema.parse(input);
    assertUniqueClientIds(config.clients);
    return config;
}
export function createAuthStartupLogDetails(config) {
    return {
        callbackPath: config.callbackPath,
        clientIds: config.clients.map((client) => client.clientId),
        clientsCount: config.clients.length,
        providerAuthorizationHost: new URL(config.provider.authorizationEndpoint).host,
        providerIssuer: config.provider.issuer,
        redirectUriFingerprints: Object.fromEntries(config.clients.map((client) => [client.clientId, fingerprintRedirectUri(client.redirectUri)])),
        scopesByClient: Object.fromEntries(config.clients.map((client) => [client.clientId, [...client.scopes]])),
        usePkce: config.provider.usePkce,
    };
}
