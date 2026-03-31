import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createAuthStartupLogDetails,
  parseAuthConfig,
} from "./schema.js";

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

describe("auth2 config schema", () => {
  it("parses a strict auth config and produces a safe startup log summary", () => {
    const config = parseAuthConfig({
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
        {
          clientId: "client-b",
          providerId: "default",
          redirectUri: "https://chatgpt.com/oauth/callback",
          scopes: ["openid"],
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
    });

    expect(config).toMatchObject({
      callbackPath: "/oauth/callback",
      clients: [
        {
          clientId: "client-a",
          redirectUri: "https://claude.ai/oauth/callback",
        },
        {
          clientId: "client-b",
          redirectUri: "https://chatgpt.com/oauth/callback",
        },
      ],
    });

    expect(createAuthStartupLogDetails(config)).toEqual({
      callbackPath: "/oauth/callback",
      clientIds: ["client-a", "client-b"],
      clientsCount: 2,
      providerAuthorizationHost: "id.example.com",
      providerIssuer: "https://id.example.com",
      redirectUriFingerprints: {
        "client-a": fingerprint("https://claude.ai/oauth/callback"),
        "client-b": fingerprint("https://chatgpt.com/oauth/callback"),
      },
      scopesByClient: {
        "client-a": ["openid", "profile"],
        "client-b": ["openid"],
      },
      usePkce: true,
    });
  });

  it("rejects duplicate client ids", () => {
    expect(() => parseAuthConfig({
      accessTokenTtlSec: 3600,
      authCodeTtlSec: 300,
      callbackPath: "/oauth/callback",
      clients: [
        {
          clientId: "duplicate-client",
          providerId: "default",
          redirectUri: "https://claude.ai/oauth/callback",
          scopes: ["openid", "profile"],
        },
        {
          clientId: "duplicate-client",
          providerId: "default",
          redirectUri: "https://chatgpt.com/oauth/callback",
          scopes: ["openid"],
        },
      ],
      provider: {
        authorizationEndpoint: "https://id.example.com/oauth/authorize",
        clientId: "provider-client-id",
        issuer: "https://id.example.com",
        tokenEndpoint: "https://id.example.com/oauth/token",
        usePkce: true,
      },
      publicBaseUrl: "https://mcp.example.com",
      refreshTokenTtlSec: 2_592_000,
    })).toThrow("OAuth client IDs must be unique. Duplicate client_id: duplicate-client");
  });
});
