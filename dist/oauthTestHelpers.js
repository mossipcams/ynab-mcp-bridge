import { createHash } from "node:crypto";
import { createServer as createNodeHttpServer } from "node:http";
import { expect } from "vitest";
import { getArrayValue, getNumberValue, getStringValue, isRecord } from "./typeUtils.js";
const DEFAULT_REMOTE_ORIGIN = "https://claude.ai";
const DEFAULT_REDIRECT_URI = `${DEFAULT_REMOTE_ORIGIN}/oauth/callback`;
const DEFAULT_RESOURCE = "https://mcp.example.com/mcp";
const DEFAULT_SCOPE = "openid profile";
export function createCodeChallenge(codeVerifier) {
    return createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");
}
export function createCloudflareOAuthAuth(overrides = {}) {
    return {
        audience: DEFAULT_RESOURCE,
        authorizationUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization",
        callbackPath: "/oauth/callback",
        clientId: "cloudflare-client-id",
        clientSecret: "cloudflare-client-secret",
        deployment: "oauth-single-tenant",
        issuer: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123",
        jwksUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/jwks",
        mode: "oauth",
        publicUrl: DEFAULT_RESOURCE,
        scopes: ["openid", "profile"],
        tokenSigningSecret: "test-oauth-signing-secret",
        tokenUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
        ...overrides,
    };
}
export async function startUpstreamOAuthServer(cleanups) {
    let lastTokenRequest;
    const server = createNodeHttpServer((req, res) => {
        const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
        if (requestUrl.pathname === "/authorize") {
            res.statusCode = 200;
            res.end("ok");
            return;
        }
        if (requestUrl.pathname === "/jwks") {
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ keys: [] }));
            return;
        }
        if (requestUrl.pathname === "/token" && req.method === "POST") {
            const chunks = [];
            req.on("data", (chunk) => {
                chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
            });
            req.on("end", () => {
                lastTokenRequest = {
                    authorization: req.headers.authorization,
                    body: new URLSearchParams(Buffer.concat(chunks).toString("utf8")),
                };
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify({
                    access_token: "upstream-access-token",
                    expires_in: 3600,
                    refresh_token: "upstream-refresh-token",
                    scope: DEFAULT_SCOPE,
                    token_type: "Bearer",
                }));
            });
            return;
        }
        res.statusCode = 404;
        res.end();
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            server.off("error", reject);
            resolve();
        });
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Upstream OAuth test server did not expose a TCP address");
    }
    const origin = `http://127.0.0.1:${address.port}`;
    cleanups.push(async () => {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    });
    return {
        authorizationUrl: `${origin}/authorize`,
        getLastTokenRequest: () => lastTokenRequest,
        issuer: origin,
        jwksUrl: `${origin}/jwks`,
        tokenUrl: `${origin}/token`,
    };
}
export async function registerOAuthClient(httpServerUrl, overrides = {}) {
    const registrationResponse = await fetch(new URL("/register", httpServerUrl), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Origin: overrides.origin ?? DEFAULT_REMOTE_ORIGIN,
        },
        body: JSON.stringify({
            client_name: "Claude Web",
            grant_types: ["authorization_code", "refresh_token"],
            redirect_uris: [DEFAULT_REDIRECT_URI],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
        }),
    });
    expect(registrationResponse.status).toBe(201);
    const registration = await registrationResponse.json();
    if (!isRecord(registration)) {
        throw new Error("OAuth client registration did not return an object.");
    }
    const clientId = getStringValue(registration, "client_id");
    if (!clientId) {
        throw new Error("OAuth client registration did not return a client_id.");
    }
    return {
        client_id: clientId,
        ...(typeof getNumberValue(registration, "client_id_issued_at") === "number"
            ? { client_id_issued_at: getNumberValue(registration, "client_id_issued_at") }
            : {}),
        ...(typeof getStringValue(registration, "client_name") === "string"
            ? { client_name: getStringValue(registration, "client_name") }
            : {}),
        ...(Array.isArray(getArrayValue(registration, "grant_types"))
            ? { grant_types: getArrayValue(registration, "grant_types")?.filter((value) => typeof value === "string") }
            : {}),
        ...(Array.isArray(getArrayValue(registration, "redirect_uris"))
            ? { redirect_uris: getArrayValue(registration, "redirect_uris")?.filter((value) => typeof value === "string") }
            : {}),
        ...(Array.isArray(getArrayValue(registration, "response_types"))
            ? { response_types: getArrayValue(registration, "response_types")?.filter((value) => typeof value === "string") }
            : {}),
        ...(typeof getStringValue(registration, "token_endpoint_auth_method") === "string"
            ? { token_endpoint_auth_method: getStringValue(registration, "token_endpoint_auth_method") }
            : {}),
    };
}
export async function startAuthorization(httpServerUrl, clientId, codeChallenge = "test-challenge", overrides = {}) {
    return await fetch(new URL(`/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(DEFAULT_REDIRECT_URI)}&response_type=code&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256&scope=${encodeURIComponent(DEFAULT_SCOPE)}&state=client-state-123&resource=${encodeURIComponent(DEFAULT_RESOURCE)}`, httpServerUrl), {
        redirect: "manual",
        headers: {
            Origin: overrides.origin ?? DEFAULT_REMOTE_ORIGIN,
        },
    });
}
export async function approveAuthorizationConsent(httpServerUrl, consentBody, overrides = {}) {
    const challengeMatch = consentBody.match(/name="consent_challenge" value="([^"]+)"/);
    const consentChallenge = challengeMatch?.[1];
    expect(consentChallenge).toBeTruthy();
    return await fetch(new URL("/authorize/consent", httpServerUrl), {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Origin: overrides.origin ?? DEFAULT_REMOTE_ORIGIN,
        },
        body: new URLSearchParams({
            action: overrides.action ?? "approve",
            consent_challenge: consentChallenge ?? "",
        }),
        redirect: "manual",
    });
}
