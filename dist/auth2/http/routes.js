import crypto from "node:crypto";
import express from "express";
import { createAuthCore } from "../core/authCore.js";
import { createPkcePair } from "../core/pkce.js";
import { logAuthEvent } from "../logging/authEvents.js";
import { createProviderAdapter } from "../provider/providerAdapter.js";
import { createFileAuthStore, createInMemoryAuthStore } from "../store/authStore.js";
import { isPublicMcpBootstrapMethod } from "../../authAdmissionPolicy.js";
function getIssuerUrl(auth) {
    return new URL("/", new URL(auth.publicUrl).origin).href;
}
function getSupportedScopes(config) {
    return Array.from(new Set(config.clients.flatMap((client) => client.scopes))).sort();
}
function getMetadataEndpoints(auth) {
    const origin = new URL(auth.publicUrl).origin;
    return {
        authorizationEndpoint: new URL("/authorize", origin).href,
        issuer: getIssuerUrl(auth),
        protectedResourceMetadataUrl: new URL(`/.well-known/oauth-protected-resource${new URL(auth.publicUrl).pathname}`, origin).href,
        registrationEndpoint: new URL("/register", origin).href,
        tokenEndpoint: new URL("/token", origin).href,
    };
}
function getSingleString(value) {
    return typeof value === "string" && value.length > 0
        ? value
        : undefined;
}
function getStringArray(value) {
    return Array.isArray(value)
        ? value.filter((entry) => typeof entry === "string" && entry.length > 0)
        : undefined;
}
function writeOAuthError(res, status, error, errorDescription) {
    res.status(status).json({
        error,
        error_description: errorDescription,
    });
}
function getProtectedResourceMetadata(auth, authorizationServerIssuer) {
    return {
        authorization_servers: [authorizationServerIssuer],
        bearer_methods_supported: ["header"],
        resource: auth.publicUrl,
    };
}
function writeProtectedResourceAuthError(res, protectedResourceMetadataUrl, errorDescription) {
    res.status(401).setHeader("www-authenticate", `Bearer realm="mcp", resource_metadata="${protectedResourceMetadataUrl}"`).json({
        error: "invalid_token",
        ...(errorDescription ? { error_description: errorDescription } : {}),
    });
}
function createClientId() {
    return crypto.randomBytes(16).toString("base64url");
}
function isLoopbackHost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}
function validateRegisteredRedirectUri(redirectUri) {
    const parsed = new URL(redirectUri);
    if (parsed.protocol === "https:" || isLoopbackHost(parsed.hostname)) {
        return;
    }
    throw new Error("redirect_uris must use https unless they target a loopback host.");
}
function registerClient(config, store, body) {
    const payload = typeof body === "object" && body !== null
        ? body
        : {};
    const redirectUris = getStringArray(payload["redirect_uris"]);
    const grantTypes = getStringArray(payload["grant_types"]);
    const responseTypes = getStringArray(payload["response_types"]);
    const tokenEndpointAuthMethod = getSingleString(payload["token_endpoint_auth_method"]);
    const clientName = getSingleString(payload["client_name"]);
    if (!redirectUris || redirectUris.length !== 1) {
        throw new Error("redirect_uris must contain exactly one redirect URI.");
    }
    if (!grantTypes?.includes("authorization_code")) {
        throw new Error("grant_types must include authorization_code.");
    }
    if (!responseTypes?.includes("code")) {
        throw new Error("response_types must include code.");
    }
    if (tokenEndpointAuthMethod !== "none") {
        throw new Error("token_endpoint_auth_method must be none.");
    }
    const redirectUri = redirectUris[0];
    if (!redirectUri) {
        throw new Error("redirect_uris must contain exactly one redirect URI.");
    }
    validateRegisteredRedirectUri(redirectUri);
    const clientId = createClientId();
    const issuedAt = Math.floor(Date.now() / 1000);
    const providerId = config.clients[0]?.providerId ?? "default";
    const scopes = getSupportedScopes(config);
    store.saveRegisteredClient({
        clientId,
        clientIdIssuedAt: issuedAt,
        ...(clientName ? { clientName } : {}),
        grantTypes,
        providerId,
        redirectUri,
        responseTypes,
        scopes,
        tokenEndpointAuthMethod: "none",
    });
    return {
        client_id: clientId,
        client_id_issued_at: issuedAt,
        ...(clientName ? { client_name: clientName } : {}),
        grant_types: grantTypes,
        redirect_uris: redirectUris,
        response_types: responseTypes,
        token_endpoint_auth_method: tokenEndpointAuthMethod,
    };
}
function createRouteCore(config, auth) {
    const storeSecret = auth.tokenSigningSecret ?? auth.clientSecret;
    const store = auth.storePath
        ? createFileAuthStore(auth.storePath, { secret: storeSecret })
        : createInMemoryAuthStore({ secret: storeSecret });
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
export function installAuthV2Routes(context) {
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
    const auth = context.auth;
    const auth2Config = context.auth2Config;
    const protectedPathPrefix = `${context.path.replace(/\/$/, "")}/resources/`;
    const mcpJsonParser = express.json();
    const { core, store } = createRouteCore(auth2Config, auth);
    const metadata = getMetadataEndpoints(auth);
    const scopesSupported = getSupportedScopes(auth2Config);
    context.app.get("/.well-known/oauth-authorization-server", (_req, res) => {
        res.status(200).json({
            authorization_endpoint: metadata.authorizationEndpoint,
            code_challenge_methods_supported: ["S256"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            issuer: metadata.issuer,
            registration_endpoint: metadata.registrationEndpoint,
            response_types_supported: ["code"],
            scopes_supported: scopesSupported,
            token_endpoint: metadata.tokenEndpoint,
            token_endpoint_auth_methods_supported: ["none"],
        });
    });
    context.app.get("/.well-known/openid-configuration", (_req, res) => {
        res.status(200).json({
            authorization_endpoint: metadata.authorizationEndpoint,
            code_challenge_methods_supported: ["S256"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            issuer: metadata.issuer,
            registration_endpoint: metadata.registrationEndpoint,
            response_types_supported: ["code"],
            scopes_supported: scopesSupported,
            subject_types_supported: ["public"],
            token_endpoint: metadata.tokenEndpoint,
            token_endpoint_auth_methods_supported: ["none"],
        });
    });
    context.app.get(`/.well-known/oauth-protected-resource${context.path}`, (_req, res) => {
        res.status(200).json(getProtectedResourceMetadata(auth, metadata.issuer));
    });
    context.app.post("/register", express.json(), (req, res) => {
        try {
            const registeredClient = registerClient(auth2Config, store, req.body);
            res.status(201).json(registeredClient);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            writeOAuthError(res, 400, "invalid_client_metadata", message);
        }
    });
    context.app.use((req, res, next) => {
        if (req.path === context.path && req.method === "POST") {
            mcpJsonParser(req, res, next);
            return;
        }
        next();
    });
    context.app.use((req, res, next) => {
        const isProtectedRequest = req.path === context.path || req.path.startsWith(protectedPathPrefix);
        if (!isProtectedRequest) {
            next();
            return;
        }
        const authorization = req.headers.authorization;
        const jsonRpcMethod = req.path === context.path && req.method === "POST"
            ? getSingleString(req.body?.["method"])
            : undefined;
        if (!authorization?.startsWith("Bearer ") &&
            typeof req.headers["cf-access-jwt-assertion"] !== "string" &&
            isPublicMcpBootstrapMethod(jsonRpcMethod)) {
            next();
            return;
        }
        if (!authorization?.startsWith("Bearer ")) {
            writeProtectedResourceAuthError(res, metadata.protectedResourceMetadataUrl);
            return;
        }
        const token = authorization.slice("Bearer ".length).trim();
        const accessToken = store.getAccessToken(token);
        if (!accessToken || accessToken.expiresAt <= Date.now()) {
            writeProtectedResourceAuthError(res, metadata.protectedResourceMetadataUrl, "Bearer token is invalid or expired.");
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
        }
        catch (error) {
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logAuthEvent("auth.callback.failed", {
                errorMessage: message,
                route: "/oauth/callback",
            });
            writeOAuthError(res, 400, "invalid_request", message);
        }
    });
    context.app.post("/token", async (req, res) => {
        try {
            if (typeof req.headers.authorization === "string" || getSingleString(req.body?.["client_secret"])) {
                writeOAuthError(res, 400, "invalid_client", "Public clients must not use token endpoint authentication.");
                return;
            }
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            writeOAuthError(res, 400, "invalid_grant", message);
        }
    });
    return {
        installed: true,
        stack: "v2",
    };
}
