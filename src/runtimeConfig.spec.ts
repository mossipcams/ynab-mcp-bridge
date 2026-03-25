import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import { assertBackendEnvironment, resolveRuntimeConfig } from "./runtimeConfig.js";

describe("resolveRuntimeConfig", () => {
  it("prefers explicit CLI flags for http mode", () => {
    const config = resolveRuntimeConfig(
      [
        "--transport",
        "http",
        "--host",
        "127.0.0.1",
        "--port",
        "8080",
        "--path",
        "/bridge",
        "--allowed-origins",
        "https://claude.ai,https://chat.openai.com",
      ],
      {},
    );

    expect(config).toEqual({
      allowedHosts: [],
      allowedOrigins: ["https://claude.ai", "https://chat.openai.com"],
      auth: {
        deployment: "authless",
        mode: "none",
      },
      host: "127.0.0.1",
      path: "/bridge",
      port: 8080,
      transport: "http",
    });
  });

  it("falls back to environment variables", () => {
    const config = resolveRuntimeConfig([], {
      MCP_ALLOWED_ORIGINS: "https://claude.ai, https://chat.openai.com",
      MCP_PATH: "/mcp-http",
      MCP_PORT: "9000",
      MCP_TRANSPORT: "http",
    });

    expect(config).toEqual({
      allowedHosts: [],
      allowedOrigins: ["https://claude.ai", "https://chat.openai.com"],
      auth: {
        deployment: "authless",
        mode: "none",
      },
      host: "127.0.0.1",
      path: "/mcp-http",
      port: 9000,
      transport: "http",
    });
  });

  it("defaults to http on port 3000 when no transport is provided", () => {
    expect(resolveRuntimeConfig([], {})).toEqual({
      allowedHosts: [],
      allowedOrigins: [],
      auth: {
        deployment: "authless",
        mode: "none",
      },
      host: "127.0.0.1",
      path: "/mcp",
      port: 3000,
      transport: "http",
    });
  });

  it("resolves oauth mode with public metadata settings", () => {
    expect(resolveRuntimeConfig([], {
      MCP_AUTH_MODE: "oauth",
      MCP_OAUTH_AUDIENCE: "https://mcp.example.com",
      MCP_OAUTH_AUTHORIZATION_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization",
      MCP_OAUTH_CLIENT_ID: "cloudflare-client-id",
      MCP_OAUTH_CLIENT_SECRET: "cloudflare-client-secret",
      MCP_OAUTH_ISSUER: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123",
      MCP_OAUTH_JWKS_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/jwks",
      MCP_OAUTH_SCOPES: "openid,profile,email",
      MCP_OAUTH_STORE_PATH: "/tmp/ynab-mcp-oauth-store.json",
      MCP_OAUTH_TOKEN_SIGNING_SECRET: "test-signing-secret",
      MCP_OAUTH_TOKEN_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    })).toEqual({
      allowedHosts: [],
      allowedOrigins: [],
      auth: {
        audience: "https://mcp.example.com",
        authorizationUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization",
        callbackPath: "/oauth/callback",
        clientId: "cloudflare-client-id",
        clientSecret: "cloudflare-client-secret",
        deployment: "oauth-single-tenant",
        issuer: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123",
        jwksUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/jwks",
        mode: "oauth",
        publicUrl: "https://mcp.example.com/mcp",
        scopes: ["openid", "profile", "email", "offline_access"],
        storePath: "/tmp/ynab-mcp-oauth-store.json",
        tokenSigningSecret: "test-signing-secret",
        tokenUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
      },
      host: "127.0.0.1",
      path: "/mcp",
      port: 3000,
      transport: "http",
    });
  });

  it("adds offline_access to oauth scopes when it is not explicitly configured", () => {
    expect(resolveRuntimeConfig([], {
      MCP_AUTH_MODE: "oauth",
      MCP_OAUTH_AUDIENCE: "https://mcp.example.com",
      MCP_OAUTH_AUTHORIZATION_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization",
      MCP_OAUTH_CLIENT_ID: "cloudflare-client-id",
      MCP_OAUTH_CLIENT_SECRET: "cloudflare-client-secret",
      MCP_OAUTH_ISSUER: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123",
      MCP_OAUTH_JWKS_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/jwks",
      MCP_OAUTH_SCOPES: "openid,profile,email",
      MCP_OAUTH_STORE_PATH: "/tmp/ynab-mcp-oauth-store.json",
      MCP_OAUTH_TOKEN_SIGNING_SECRET: "test-signing-secret",
      MCP_OAUTH_TOKEN_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    }).auth).toMatchObject({
      mode: "oauth",
      scopes: ["openid", "profile", "email", "offline_access"],
    });
  });

  it("deduplicates offline_access when it is already configured", () => {
    expect(resolveRuntimeConfig([], {
      MCP_AUTH_MODE: "oauth",
      MCP_OAUTH_AUDIENCE: "https://mcp.example.com",
      MCP_OAUTH_AUTHORIZATION_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization",
      MCP_OAUTH_CLIENT_ID: "cloudflare-client-id",
      MCP_OAUTH_CLIENT_SECRET: "cloudflare-client-secret",
      MCP_OAUTH_ISSUER: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123",
      MCP_OAUTH_JWKS_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/jwks",
      MCP_OAUTH_SCOPES: "openid,offline_access,profile,offline_access",
      MCP_OAUTH_STORE_PATH: "/tmp/ynab-mcp-oauth-store.json",
      MCP_OAUTH_TOKEN_SIGNING_SECRET: "test-signing-secret",
      MCP_OAUTH_TOKEN_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    }).auth).toMatchObject({
      mode: "oauth",
      scopes: ["openid", "offline_access", "profile"],
    });
  });

  it("rejects legacy Cloudflare Access oauth2 endpoints in oauth mode", () => {
    expect(() => resolveRuntimeConfig([], {
      MCP_AUTH_MODE: "oauth",
      MCP_OAUTH_AUDIENCE: "https://mcp.example.com",
      MCP_OAUTH_AUTHORIZATION_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oauth2/auth",
      MCP_OAUTH_CLIENT_ID: "cloudflare-client-id",
      MCP_OAUTH_CLIENT_SECRET: "cloudflare-client-secret",
      MCP_OAUTH_ISSUER: "https://example.cloudflareaccess.com",
      MCP_OAUTH_JWKS_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/certs",
      MCP_OAUTH_STORE_PATH: "/tmp/ynab-mcp-oauth-store.json",
      MCP_OAUTH_TOKEN_SIGNING_SECRET: "test-signing-secret",
      MCP_OAUTH_TOKEN_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oauth2/token",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    })).toThrow(
      "Cloudflare Access OAuth settings must use the per-application OIDC SaaS endpoints under /cdn-cgi/access/sso/oidc/<client-id> for issuer, authorization, token, and jwks URLs.",
    );
  });

  it("throws for unsupported transports", () => {
    expect(() => resolveRuntimeConfig(["--transport", "sse"], {})).toThrow(
      "Unsupported transport: sse",
    );
  });

  it("fails fast when oauth mode is missing upstream client credentials", () => {
    expect(() => resolveRuntimeConfig([], {
      MCP_AUTH_MODE: "oauth",
      MCP_OAUTH_AUDIENCE: "https://mcp.example.com",
      MCP_OAUTH_AUTHORIZATION_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization",
      MCP_OAUTH_ISSUER: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123",
      MCP_OAUTH_JWKS_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/jwks",
      MCP_OAUTH_TOKEN_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    })).toThrow(
      "OAuth mode requires MCP_PUBLIC_URL, MCP_OAUTH_ISSUER, MCP_OAUTH_AUTHORIZATION_URL, MCP_OAUTH_TOKEN_URL, MCP_OAUTH_JWKS_URL, MCP_OAUTH_AUDIENCE, MCP_OAUTH_CLIENT_ID, MCP_OAUTH_CLIENT_SECRET, MCP_OAUTH_STORE_PATH, and MCP_OAUTH_TOKEN_SIGNING_SECRET.",
    );
  });

  it("supports explicit oauth-hardened deployment mode when trusted origins are configured", () => {
    expect(resolveRuntimeConfig([], {
      MCP_ALLOWED_ORIGINS: "https://claude.ai",
      MCP_DEPLOYMENT_MODE: "oauth-hardened",
      MCP_OAUTH_AUDIENCE: "https://mcp.example.com",
      MCP_OAUTH_AUTHORIZATION_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization",
      MCP_OAUTH_CLIENT_ID: "cloudflare-client-id",
      MCP_OAUTH_CLIENT_SECRET: "cloudflare-client-secret",
      MCP_OAUTH_ISSUER: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123",
      MCP_OAUTH_JWKS_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/jwks",
      MCP_OAUTH_STORE_PATH: "/tmp/ynab-mcp-oauth-store.json",
      MCP_OAUTH_TOKEN_SIGNING_SECRET: "test-signing-secret",
      MCP_OAUTH_TOKEN_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    })).toMatchObject({
      allowedOrigins: ["https://claude.ai"],
      auth: {
        deployment: "oauth-hardened",
        mode: "oauth",
      },
    });
  });

  it("rejects oauth deployments on stdio transport", () => {
    expect(() => resolveRuntimeConfig(["--transport", "stdio"], {
      MCP_DEPLOYMENT_MODE: "oauth-single-tenant",
      MCP_OAUTH_AUDIENCE: "https://mcp.example.com",
      MCP_OAUTH_AUTHORIZATION_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization",
      MCP_OAUTH_CLIENT_ID: "cloudflare-client-id",
      MCP_OAUTH_CLIENT_SECRET: "cloudflare-client-secret",
      MCP_OAUTH_ISSUER: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123",
      MCP_OAUTH_JWKS_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/jwks",
      MCP_OAUTH_STORE_PATH: "/tmp/ynab-mcp-oauth-store.json",
      MCP_OAUTH_TOKEN_SIGNING_SECRET: "test-signing-secret",
      MCP_OAUTH_TOKEN_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    })).toThrow("OAuth deployment modes require HTTP transport.");
  });

  it("rejects oauth-hardened deployments without an explicit origin allowlist", () => {
    expect(() => resolveRuntimeConfig([], {
      MCP_DEPLOYMENT_MODE: "oauth-hardened",
      MCP_OAUTH_AUDIENCE: "https://mcp.example.com",
      MCP_OAUTH_AUTHORIZATION_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization",
      MCP_OAUTH_CLIENT_ID: "cloudflare-client-id",
      MCP_OAUTH_CLIENT_SECRET: "cloudflare-client-secret",
      MCP_OAUTH_ISSUER: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123",
      MCP_OAUTH_JWKS_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/jwks",
      MCP_OAUTH_STORE_PATH: "/tmp/ynab-mcp-oauth-store.json",
      MCP_OAUTH_TOKEN_SIGNING_SECRET: "test-signing-secret",
      MCP_OAUTH_TOKEN_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    })).toThrow("oauth-hardened deployment requires MCP_ALLOWED_ORIGINS or --allowed-origins.");
  });

  it("derives Cloudflare endpoints, store path, and a stable local signing secret from minimal oauth settings", () => {
    expect(resolveRuntimeConfig([], {
      MCP_DEPLOYMENT_MODE: "oauth-single-tenant",
      MCP_OAUTH_CLIENT_ID: "client-123",
      MCP_OAUTH_CLIENT_SECRET: "cloudflare-client-secret",
      MCP_OAUTH_CLOUDFLARE_DOMAIN: "example.cloudflareaccess.com",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    })).toEqual({
      allowedHosts: [],
      allowedOrigins: [],
      auth: {
        audience: "https://mcp.example.com/mcp",
        authorizationUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization",
        callbackPath: "/oauth/callback",
        clientId: "client-123",
        clientSecret: "cloudflare-client-secret",
        deployment: "oauth-single-tenant",
        issuer: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123",
        jwksUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/jwks",
        mode: "oauth",
        publicUrl: "https://mcp.example.com/mcp",
        scopes: ["offline_access"],
        storePath: path.join(homedir(), ".ynab-mcp-bridge", "oauth-store.json"),
        tokenSigningSecret: createHash("sha256")
          .update("cloudflare-client-secret\nhttps://mcp.example.com/mcp\nclient-123")
          .digest("base64url"),
        tokenUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
      },
      host: "127.0.0.1",
      path: "/mcp",
      port: 3000,
      transport: "http",
    });
  });

  it("lets explicit upstream URLs override the Cloudflare preset when both are provided", () => {
    expect(resolveRuntimeConfig([], {
      MCP_DEPLOYMENT_MODE: "oauth-single-tenant",
      MCP_OAUTH_AUTHORIZATION_URL: "https://id.example.com/oauth/authorize",
      MCP_OAUTH_CLIENT_ID: "client-123",
      MCP_OAUTH_CLIENT_SECRET: "cloudflare-client-secret",
      MCP_OAUTH_CLOUDFLARE_DOMAIN: "example.cloudflareaccess.com",
      MCP_OAUTH_ISSUER: "https://id.example.com",
      MCP_OAUTH_JWKS_URL: "https://id.example.com/.well-known/jwks.json",
      MCP_OAUTH_TOKEN_URL: "https://id.example.com/oauth/token",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    })).toMatchObject({
      auth: {
        authorizationUrl: "https://id.example.com/oauth/authorize",
        issuer: "https://id.example.com",
        jwksUrl: "https://id.example.com/.well-known/jwks.json",
        tokenUrl: "https://id.example.com/oauth/token",
      },
    });
  });
  it("throws for invalid ports", () => {
    expect(() => resolveRuntimeConfig(["--port", "abc"], {})).toThrow(
      "Invalid port: abc",
    );
  });

  it("fails fast when YNAB_API_TOKEN is missing", () => {
    expect(() => assertBackendEnvironment({})).toThrow("YNAB_API_TOKEN is required.");
  });

  it("reports whether plan resolution is configured or dynamic", () => {
    expect(assertBackendEnvironment({ YNAB_API_TOKEN: "token-1", YNAB_PLAN_ID: "plan-1" })).toEqual({
      checks: {
        ynabApiToken: true,
        ynabPlanIdConfigured: true,
      },
      planResolution: "configured",
      status: "ok",
    });

    expect(assertBackendEnvironment({ YNAB_API_TOKEN: "token-1" })).toEqual({
      checks: {
        ynabApiToken: true,
        ynabPlanIdConfigured: false,
      },
      planResolution: "dynamic",
      status: "ok",
    });
  });

  it("keeps runtimeConfig as a real module instead of a pure re-export facade", () => {
    const source = readFileSync(new URL("./runtimeConfig.ts", import.meta.url), "utf8");

    expect(source.trim()).not.toBe('export { assertBackendEnvironment, resolveRuntimeConfig } from "./config.js";');
  });
});
