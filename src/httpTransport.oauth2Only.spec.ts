import { mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { resolveAppConfig } from "./config.js";
import { startHttpServer } from "./httpTransport.js";
import { createCloudflareOAuthAuth } from "./oauthTestHelpers.js";

describe("http transport oauth2-only startup", () => {
  it("rejects oauth mode without an auth2 config", async () => {
    await expect(startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      auth: createCloudflareOAuthAuth(),
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
      ynab: {
        apiToken: "test-token",
      },
    })).rejects.toThrow("OAuth HTTP mode requires auth2Config.");
  });

  it("starts canonical oauth http routes from auth2 config with minimal runtime env", async () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "ynab-auth2-http-"));
    const configPath = path.join(fixtureDir, "auth2.json");

    writeFileSync(configPath, JSON.stringify({
      accessTokenTtlSec: 3600,
      authCodeTtlSec: 300,
      callbackPath: "/oauth/callback",
      clients: [
        {
          clientId: "client-a",
          providerId: "default",
          redirectUri: "https://claude.ai/api/mcp/auth_callback",
          scopes: ["openid", "profile"],
        },
      ],
      provider: {
        authorizationEndpoint: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization",
        clientId: "provider-client-id",
        clientSecret: "provider-client-secret",
        issuer: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123",
        jwksUri: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/jwks",
        tokenEndpoint: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
        usePkce: true,
      },
      publicBaseUrl: "https://mcp.example.com",
      refreshTokenTtlSec: 2_592_000,
    }));

    const config = resolveAppConfig([], {
      MCP_ALLOWED_ORIGINS: "https://claude.ai",
      MCP_AUTH2_CONFIG_PATH: configPath,
      MCP_DEPLOYMENT_MODE: "oauth-single-tenant",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      YNAB_API_TOKEN: "test-token",
    });

    const server = await startHttpServer({
      ...config.runtime,
      auth2Config: config.auth2Config,
      ynab: config.ynab,
    });

    try {
      const response = await fetch(new URL("/.well-known/oauth-authorization-server", server.url));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        authorization_endpoint: "https://mcp.example.com/authorize",
        issuer: "https://mcp.example.com/",
        token_endpoint: "https://mcp.example.com/token",
      });
    } finally {
      await server.close();
    }
  });
});
