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
      MCP_OAUTH_AUTHORIZATION_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oauth2/auth",
      MCP_OAUTH_ISSUER: "https://example.cloudflareaccess.com",
      MCP_OAUTH_JWKS_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/certs",
      MCP_OAUTH_SCOPES: "openid,profile,email",
      MCP_OAUTH_TOKEN_URL: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oauth2/token",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    })).toEqual({
      allowedHosts: [],
      allowedOrigins: [],
      auth: {
        audience: "https://mcp.example.com",
        authorizationUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oauth2/auth",
        issuer: "https://example.cloudflareaccess.com",
        jwksUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/certs",
        mode: "oauth",
        publicUrl: "https://mcp.example.com/mcp",
        scopes: ["openid", "profile", "email"],
        tokenUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oauth2/token",
      },
      host: "127.0.0.1",
      path: "/mcp",
      port: 3000,
      transport: "http",
    });
  });

  it("throws for unsupported transports", () => {
    expect(() => resolveRuntimeConfig(["--transport", "sse"], {})).toThrow(
      "Unsupported transport: sse",
    );
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
});
