import path from "node:path";
import { homedir } from "node:os";
import { describe, expect, it } from "vitest";

import { readYnabConfig, resolveAppConfig } from "./config.js";

describe("config", () => {
  it("resolves the full app config from CLI flags and environment", () => {
    const config = resolveAppConfig(
      [
        "--transport",
        "http",
        "--host",
        "0.0.0.0",
        "--port",
        "8080",
        "--path",
        "/bridge",
        "--allowed-origins",
        "https://claude.ai,https://chat.openai.com",
        "--allowed-hosts",
        "mcp.example.com,localhost",
      ],
      {
        MCP_ALLOWED_ORIGINS: "https://ignored.example",
        YNAB_API_TOKEN: "token-1",
        YNAB_PLAN_ID: "plan-1",
      },
    );

    expect(config).toEqual({
      runtime: {
        allowedOrigins: ["https://claude.ai", "https://chat.openai.com"],
        allowedHosts: ["mcp.example.com", "localhost"],
        auth: {
          deployment: "authless",
          mode: "none",
        },
        host: "0.0.0.0",
        path: "/bridge",
        port: 8080,
        transport: "http",
      },
      ynab: {
        apiToken: "token-1",
        planId: "plan-1",
      },
    });
  });

  it("reads allowed hosts from environment when CLI flags do not override them", () => {
    const config = resolveAppConfig(
      [],
      {
        MCP_ALLOWED_HOSTS: "mcp.example.com, localhost ",
        YNAB_API_TOKEN: "token-1",
      },
    );

    expect(config.runtime.allowedHosts).toEqual([
      "mcp.example.com",
      "localhost",
    ]);
  });

  it("reads OAuth runtime settings from environment", () => {
    const config = resolveAppConfig(
      [],
      {
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
        YNAB_API_TOKEN: "token-1",
      },
    );

    expect(config.runtime.auth).toEqual({
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
      scopes: ["openid", "profile", "email"],
      storePath: "/tmp/ynab-mcp-oauth-store.json",
      tokenSigningSecret: "test-signing-secret",
      tokenUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
    });
  });

  it("fails fast for legacy Cloudflare Access oauth2 endpoints", () => {
    expect(() => resolveAppConfig([], {
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
      YNAB_API_TOKEN: "token-1",
    })).toThrow(
      "Cloudflare Access OAuth settings must use the per-application OIDC SaaS endpoints under /cdn-cgi/access/sso/oidc/<client-id> for issuer, authorization, token, and jwks URLs.",
    );
  });

  it("fails fast when Cloudflare OAuth endpoints are combined with a non-Cloudflare jwks url", () => {
    expect(() => resolveAppConfig([], {
      MCP_AUTH_MODE: "oauth",
      MCP_OAUTH_AUDIENCE: "https://mcp.example.com",
      MCP_OAUTH_AUTHORIZATION_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization",
      MCP_OAUTH_CLIENT_ID: "cloudflare-client-id",
      MCP_OAUTH_CLIENT_SECRET: "cloudflare-client-secret",
      MCP_OAUTH_ISSUER: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123",
      MCP_OAUTH_JWKS_URL: "https://keys.example.com/jwks.json",
      MCP_OAUTH_STORE_PATH: "/tmp/ynab-mcp-oauth-store.json",
      MCP_OAUTH_TOKEN_SIGNING_SECRET: "test-signing-secret",
      MCP_OAUTH_TOKEN_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      YNAB_API_TOKEN: "token-1",
    })).toThrow(
      "Cloudflare Access OAuth settings must use the per-application OIDC SaaS endpoints under /cdn-cgi/access/sso/oidc/<client-id> for issuer, authorization, token, and jwks URLs.",
    );
  });

  it("fails fast when oauth mode is missing required settings", () => {
    expect(() => resolveAppConfig([], {
      MCP_AUTH_MODE: "oauth",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      YNAB_API_TOKEN: "token-1",
    })).toThrow("OAuth mode requires MCP_PUBLIC_URL, MCP_OAUTH_ISSUER, MCP_OAUTH_AUTHORIZATION_URL, MCP_OAUTH_TOKEN_URL, MCP_OAUTH_JWKS_URL, MCP_OAUTH_AUDIENCE, MCP_OAUTH_CLIENT_ID, MCP_OAUTH_CLIENT_SECRET, MCP_OAUTH_STORE_PATH, and MCP_OAUTH_TOKEN_SIGNING_SECRET.");
  });

  it("accepts explicit deployment profiles and keeps MCP_AUTH_MODE as a compatibility shim", () => {
    const config = resolveAppConfig([], {
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
      YNAB_API_TOKEN: "token-1",
    });

    expect(config.runtime.auth).toMatchObject({
      deployment: "oauth-hardened",
      mode: "oauth",
    });
  });

  it("requires an explicit token signing secret for a small remote deployment config", () => {
    expect(() => resolveAppConfig([], {
      MCP_DEPLOYMENT_MODE: "oauth-single-tenant",
      MCP_OAUTH_CLIENT_ID: "client-123",
      MCP_OAUTH_CLIENT_SECRET: "cloudflare-client-secret",
      MCP_OAUTH_CLOUDFLARE_DOMAIN: "example.cloudflareaccess.com",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      YNAB_API_TOKEN: "token-1",
    })).toThrow(
      "OAuth deployment requires MCP_OAUTH_TOKEN_SIGNING_SECRET so broker-issued tokens remain stable across restarts and upstream credential rotation. The callback URL to register upstream is https://mcp.example.com/oauth/callback.",
    );
  });

  it("fails with an actionable setup message when oauth deployment settings are incomplete", () => {
    expect(() => resolveAppConfig([], {
      MCP_DEPLOYMENT_MODE: "oauth-single-tenant",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      YNAB_API_TOKEN: "token-1",
    })).toThrow(
      "OAuth deployment requires MCP_OAUTH_CLIENT_ID, MCP_OAUTH_CLIENT_SECRET, and either MCP_OAUTH_CLOUDFLARE_DOMAIN or the explicit MCP_OAUTH_ISSUER, MCP_OAUTH_AUTHORIZATION_URL, MCP_OAUTH_TOKEN_URL, and MCP_OAUTH_JWKS_URL settings. The callback URL to register upstream is https://mcp.example.com/oauth/callback.",
    );
  });

  it("fails fast when deployment mode conflicts with the legacy auth mode", () => {
    expect(() => resolveAppConfig([], {
      MCP_AUTH_MODE: "oauth",
      MCP_DEPLOYMENT_MODE: "authless",
      YNAB_API_TOKEN: "token-1",
    })).toThrow("MCP_DEPLOYMENT_MODE=authless is incompatible with MCP_AUTH_MODE=oauth.");
  });

  it("reads only YNAB settings from environment", () => {
    expect(readYnabConfig({
      YNAB_API_TOKEN: "  token-2  ",
      YNAB_PLAN_ID: "  plan-2  ",
    })).toEqual({
      apiToken: "token-2",
      planId: "plan-2",
    });
  });

  it("fails fast when the API token is missing", () => {
    expect(() => resolveAppConfig([], {})).toThrow("YNAB_API_TOKEN is required.");
  });
});
