import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { parseAuthConfig } from "./auth2/config/schema.js";
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
      scopes: ["openid", "profile", "email", "offline_access"],
      storePath: "/tmp/ynab-mcp-oauth-store.json",
      tokenSigningSecret: "test-signing-secret",
      tokenUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
    });
  });

  it("adds offline_access to app oauth scopes when it is not explicitly configured", () => {
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

    expect(config.runtime.auth).toMatchObject({
      mode: "oauth",
      scopes: ["openid", "profile", "email", "offline_access"],
    });
  });

  it("deduplicates offline_access in app oauth scopes when it is already configured", () => {
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
        MCP_OAUTH_SCOPES: "openid,offline_access,profile,offline_access",
        MCP_OAUTH_STORE_PATH: "/tmp/ynab-mcp-oauth-store.json",
        MCP_OAUTH_TOKEN_SIGNING_SECRET: "test-signing-secret",
        MCP_OAUTH_TOKEN_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
        MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
        YNAB_API_TOKEN: "token-1",
      },
    );

    expect(config.runtime.auth).toMatchObject({
      mode: "oauth",
      scopes: ["openid", "offline_access", "profile"],
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

  it("derives Cloudflare OAuth endpoints and local defaults from a small remote deployment config", () => {
    const config = resolveAppConfig([], {
      MCP_DEPLOYMENT_MODE: "oauth-single-tenant",
      MCP_OAUTH_CLIENT_ID: "client-123",
      MCP_OAUTH_CLIENT_SECRET: "cloudflare-client-secret",
      MCP_OAUTH_CLOUDFLARE_DOMAIN: "example.cloudflareaccess.com",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      YNAB_API_TOKEN: "token-1",
    });

    expect(config.runtime.auth).toEqual({
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
    });
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

  it("loads strict auth2 config from a file by default", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "ynab-auth2-config-"));
    const configPath = path.join(fixtureDir, "auth2.json");

    writeFileSync(configPath, JSON.stringify({
      accessTokenTtlSec: 3600,
      authCodeTtlSec: 300,
      callbackPath: "/oauth/callback",
      clients: [
        {
          clientId: "client-a",
          providerId: "default",
          redirectUri: "https://claude.ai/oauth/callback",
          scopes: ["openid", "profile"],
        },
      ],
      provider: {
        authorizationEndpoint: "https://id.example.com/oauth/authorize",
        clientId: "provider-client-id",
        clientSecret: "provider-client-secret",
        issuer: "https://id.example.com",
        tokenEndpoint: "https://id.example.com/oauth/token",
        usePkce: true,
      },
      publicBaseUrl: "https://mcp.example.com",
      refreshTokenTtlSec: 2_592_000,
    }));

    const config = resolveAppConfig([], {
      MCP_AUTH_MODE: "oauth",
      MCP_AUTH2_CONFIG_PATH: configPath,
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

    expect(config.auth2Config).toMatchObject({
      callbackPath: "/oauth/callback",
      clients: [
        {
          clientId: "client-a",
          redirectUri: "https://claude.ai/oauth/callback",
        },
      ],
      publicBaseUrl: "https://mcp.example.com",
    });
  });

  it("derives oauth runtime settings from auth2 config when legacy env vars are omitted", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "ynab-auth2-config-"));
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
          scopes: ["openid", "profile", "email"],
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
      MCP_AUTH2_CONFIG_PATH: configPath,
      MCP_DEPLOYMENT_MODE: "oauth-single-tenant",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      YNAB_API_TOKEN: "token-1",
    });

    expect(config.auth2Config).toMatchObject({
      callbackPath: "/oauth/callback",
      publicBaseUrl: "https://mcp.example.com",
    });
    expect(config.runtime.auth).toEqual({
      audience: "https://mcp.example.com/mcp",
      authorizationUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization",
      callbackPath: "/oauth/callback",
      clientId: "provider-client-id",
      clientSecret: "provider-client-secret",
      deployment: "oauth-single-tenant",
      issuer: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123",
      jwksUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/jwks",
      mode: "oauth",
      publicUrl: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile", "email", "offline_access"],
      storePath: path.join(homedir(), ".ynab-mcp-bridge", "oauth-store.json"),
      tokenSigningSecret: createHash("sha256")
        .update("provider-client-secret\nhttps://mcp.example.com/mcp\nprovider-client-id")
        .digest("base64url"),
      tokenUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
    });
  });

  it("ships an example auth2 config file that parses as the canonical oauth path", () => {
    const exampleConfig = parseAuthConfig(JSON.parse(
      readFileSync(new URL("../auth2.config.example.json", import.meta.url), "utf8"),
    ));

    expect(exampleConfig).toMatchObject({
      callbackPath: "/oauth/callback",
      clients: [
        {
          clientId: "example-claude-client",
          providerId: "default",
          redirectUri: "https://claude.ai/api/mcp/auth_callback",
          scopes: ["openid", "profile"],
        },
      ],
      provider: {
        authorizationEndpoint: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/example-client-id/authorization",
        clientId: "example-client-id",
        clientSecret: "replace-me",
        issuer: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/example-client-id",
        tokenEndpoint: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/example-client-id/token",
        usePkce: true,
      },
      publicBaseUrl: "https://mcp.example.com",
    });
  });

  it("keeps app config focused on composition instead of owning runtime resolution internals", () => {
    const source = readFileSync(new URL("./config.ts", import.meta.url), "utf8");

    expect(source).toContain('from "./runtimeConfig.js"');
    expect(source).toContain('from "./ynabConfig.js"');
    expect(source).not.toContain("export function resolveRuntimeConfig");
    expect(source).not.toContain("export function assertBackendEnvironment");
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

  it("documents a local preflight command that matches the CI validation flow", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

    expect(packageJson.scripts?.preflight).toBe(
      "npm run test:ci && npm run test:coverage && npm run lint:deps && npm run lint && npm run typecheck && npm run lint:unused && npm run build",
    );
    expect(readme).toContain("npm run preflight");
    expect(readme).toContain("auth2.config.example.json");
    expect(readme).toContain("MCP_AUTH2_CONFIG_PATH");
    expect(readme).toContain("With an auth2 config file in place, the minimal remote OAuth env surface is:");
    expect(readme).toContain("- `MCP_PUBLIC_URL`");
    expect(readme).toContain("- `MCP_AUTH2_CONFIG_PATH`");
    expect(readme).toContain("Optional auth2-backed OAuth mode for remote clients such as Claude Web");
    expect(readme).not.toContain("Optional OAuth broker mode");
  });
});
