import express from "express";
import { createOAuthMetadata, getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { getEffectiveOAuthScopes } from "./config.js";
import { createOAuthBroker } from "./oauthBroker.js";
function getOpenIdConfiguration(auth, oauthBroker) {
    const scopesSupported = getEffectiveOAuthScopes(auth.scopes);
    const oauthMetadata = createOAuthMetadata({
        issuerUrl: oauthBroker.getIssuerUrl(),
        provider: oauthBroker.provider,
        scopesSupported,
    });
    return {
        authorization_endpoint: oauthMetadata.authorization_endpoint,
        code_challenge_methods_supported: oauthMetadata.code_challenge_methods_supported,
        grant_types_supported: oauthMetadata.grant_types_supported,
        issuer: oauthMetadata.issuer,
        registration_endpoint: oauthMetadata.registration_endpoint,
        response_types_supported: oauthMetadata.response_types_supported,
        scopes_supported: oauthMetadata.scopes_supported,
        subject_types_supported: ["public"],
        token_endpoint: oauthMetadata.token_endpoint,
        token_endpoint_auth_methods_supported: oauthMetadata.token_endpoint_auth_methods_supported,
    };
}
export function createMcpAuthModule(auth) {
    const oauthBroker = createOAuthBroker(auth);
    const publicServerUrl = new URL(auth.publicUrl);
    const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(publicServerUrl);
    const scopesSupported = getEffectiveOAuthScopes(auth.scopes);
    const router = express.Router();
    router.use(oauthBroker.callbackPath, oauthBroker.handleCallback);
    router.post("/authorize/consent", express.urlencoded({ extended: false }), oauthBroker.handleConsent);
    router.get("/.well-known/openid-configuration", (_req, res) => {
        res.status(200).json(getOpenIdConfiguration(auth, oauthBroker));
    });
    router.use(mcpAuthRouter({
        baseUrl: oauthBroker.getIssuerUrl(),
        issuerUrl: oauthBroker.getIssuerUrl(),
        provider: oauthBroker.provider,
        resourceName: "YNAB MCP Bridge",
        resourceServerUrl: publicServerUrl,
        scopesSupported,
    }));
    return {
        authMiddleware: requireBearerAuth({
            requiredScopes: scopesSupported,
            resourceMetadataUrl,
            verifier: oauthBroker.provider,
        }),
        protectedResourceMetadata: {
            authorization_servers: [oauthBroker.getIssuerUrl().href],
            resource: publicServerUrl.href,
            resource_name: "YNAB MCP Bridge",
            scopes_supported: scopesSupported.length > 0 ? scopesSupported : undefined,
        },
        router,
    };
}
