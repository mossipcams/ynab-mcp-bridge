import { describe, expect, it } from "vitest";

import {
  assertExactRedirectUri,
  findClientConfig,
} from "./redirectUri.js";
import type { AuthConfig } from "../config/schema.js";
import { createInMemoryAuthStore } from "../store/authStore.js";

function createConfig(): AuthConfig {
  return {
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
      issuer: "https://id.example.com",
      tokenEndpoint: "https://id.example.com/oauth/token",
      usePkce: true,
    },
    publicBaseUrl: "https://mcp.example.com",
    refreshTokenTtlSec: 2_592_000,
  };
}

describe("redirect URI matching", () => {
  it("accepts an exact registered redirect URI", () => {
    const client = findClientConfig(createConfig(), createInMemoryAuthStore(), "client-a");

    expect(client.redirectUri).toBe("https://claude.ai/oauth/callback");
    expect(assertExactRedirectUri(client, "https://claude.ai/oauth/callback")).toEqual({
      clientId: "client-a",
      match: true,
      registeredRedirectUri: "https://claude.ai/oauth/callback",
      requestedRedirectUri: "https://claude.ai/oauth/callback",
    });
  });

  it("rejects a redirect URI with a different path", () => {
    const client = findClientConfig(createConfig(), createInMemoryAuthStore(), "client-a");

    expect(() => assertExactRedirectUri(client, "https://claude.ai/api/mcp/auth_callback")).toThrow(
      "redirect_uri does not match the registered client redirect URI.",
    );
  });

  it("rejects a redirect URI with a trailing slash difference", () => {
    const client = findClientConfig(createConfig(), createInMemoryAuthStore(), "client-a");

    expect(() => assertExactRedirectUri(client, "https://claude.ai/oauth/callback/")).toThrow(
      "redirect_uri does not match the registered client redirect URI.",
    );
  });

  it("rejects a redirect URI with a query string difference", () => {
    const client = findClientConfig(createConfig(), createInMemoryAuthStore(), "client-b");

    expect(() => assertExactRedirectUri(client, "https://chatgpt.com/oauth/callback?foo=bar")).toThrow(
      "redirect_uri does not match the registered client redirect URI.",
    );
  });

  it("rejects an unknown client id", () => {
    expect(() => findClientConfig(createConfig(), createInMemoryAuthStore(), "missing-client")).toThrow(
      "Unknown OAuth client_id: missing-client",
    );
  });
});
