import { describe, expect, it } from "vitest";

import { createAuthCore } from "./authCore.js";
import { parseAuthConfig } from "../config/schema.js";
import { createInMemoryAuthStore } from "../store/authStore.js";

function createConfig() {
  return parseAuthConfig({
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
  });
}

describe("auth core callback flow", () => {
  it("exchanges the upstream code and redirects back with a local authorization code", async () => {
    const store = createInMemoryAuthStore();
    let nextId = 0;
    const core = createAuthCore({
      config: createConfig(),
      createId: () => `generated-${++nextId}`,
      now: () => 1_700_000_000_000,
      provider: {
        buildAuthorizationUrl(input) {
          return `https://id.example.com/oauth/authorize?state=${encodeURIComponent(input.state)}`;
        },
        async exchangeAuthorizationCode(input) {
          expect(input).toEqual({
            callbackUri: "https://mcp.example.com/oauth/callback",
            code: "upstream-code-123",
            codeVerifier: "upstream-verifier",
          });

          return {
            access_token: "provider-access-token",
            refresh_token: "provider-refresh-token",
            scope: "openid profile",
            subject: "user-123",
            token_type: "Bearer",
          };
        },
      },
      store,
      upstreamPkce: {
        createPair() {
          return {
            challenge: "upstream-challenge",
            method: "S256",
            verifier: "upstream-verifier",
          };
        },
      },
    });

    const authorize = core.startAuthorization({
      clientId: "client-a",
      codeChallenge: "downstream-challenge",
      codeChallengeMethod: "S256",
      redirectUri: "https://claude.ai/oauth/callback",
      responseType: "code",
      scopes: ["openid", "profile"],
      state: "downstream-state",
    });

    const callback = await core.handleCallback({
      code: "upstream-code-123",
      state: "generated-2",
    });

    expect(authorize).toEqual({
      redirectTo: "https://id.example.com/oauth/authorize?state=generated-2",
      transactionId: "generated-1",
    });
    expect(callback.redirectTo).toBe(
      "https://claude.ai/oauth/callback?code=generated-3&state=downstream-state",
    );
    expect(store.getAuthorizationCode("generated-3")).toMatchObject({
      clientId: "client-a",
      code: "generated-3",
      codeChallenge: "downstream-challenge",
      redirectUri: "https://claude.ai/oauth/callback",
      subject: "user-123",
      transactionId: "generated-1",
      used: false,
    });
  });

  it("redirects provider callback errors to the original client redirect URI", async () => {
    const core = createAuthCore({
      config: createConfig(),
      createId: (() => {
        let nextId = 0;
        return () => `generated-${++nextId}`;
      })(),
      now: () => 1_700_000_000_000,
      provider: {
        buildAuthorizationUrl(input) {
          return `https://id.example.com/oauth/authorize?state=${encodeURIComponent(input.state)}`;
        },
        async exchangeAuthorizationCode() {
          throw new Error("should not be called");
        },
      },
      store: createInMemoryAuthStore(),
      upstreamPkce: {
        createPair() {
          return {
            challenge: "upstream-challenge",
            method: "S256",
            verifier: "upstream-verifier",
          };
        },
      },
    });

    core.startAuthorization({
      clientId: "client-a",
      codeChallenge: "downstream-challenge",
      codeChallengeMethod: "S256",
      redirectUri: "https://claude.ai/oauth/callback",
      responseType: "code",
      scopes: ["openid"],
      state: "downstream-state",
    });

    await expect(core.handleCallback({
      error: "access_denied",
      errorDescription: "user denied access",
      state: "generated-2",
    })).resolves.toEqual({
      redirectTo: "https://claude.ai/oauth/callback?error=access_denied&error_description=user+denied+access&state=downstream-state",
    });
  });

  it("rejects a callback without state", async () => {
    const core = createAuthCore({
      config: createConfig(),
      createId: () => "generated",
      now: () => 1_700_000_000_000,
      provider: {
        buildAuthorizationUrl() {
          return "https://id.example.com/oauth/authorize";
        },
        async exchangeAuthorizationCode() {
          throw new Error("should not be called");
        },
      },
      store: createInMemoryAuthStore(),
      upstreamPkce: {
        createPair() {
          return {
            challenge: "upstream-challenge",
            method: "S256",
            verifier: "upstream-verifier",
          };
        },
      },
    });

    await expect(core.handleCallback({
      code: "upstream-code-123",
    })).rejects.toThrow("Missing upstream OAuth state.");
  });

  it("rejects a replayed callback state", async () => {
    const store = createInMemoryAuthStore();
    let nextId = 0;
    const core = createAuthCore({
      config: createConfig(),
      createId: () => `generated-${++nextId}`,
      now: () => 1_700_000_000_000,
      provider: {
        buildAuthorizationUrl(input) {
          return `https://id.example.com/oauth/authorize?state=${encodeURIComponent(input.state)}`;
        },
        async exchangeAuthorizationCode() {
          return {
            access_token: "provider-access-token",
            refresh_token: "provider-refresh-token",
            subject: "user-123",
            token_type: "Bearer",
          };
        },
      },
      store,
      upstreamPkce: {
        createPair() {
          return {
            challenge: "upstream-challenge",
            method: "S256",
            verifier: "upstream-verifier",
          };
        },
      },
    });

    core.startAuthorization({
      clientId: "client-a",
      codeChallenge: "downstream-challenge",
      codeChallengeMethod: "S256",
      redirectUri: "https://claude.ai/oauth/callback",
      responseType: "code",
      scopes: ["openid"],
    });

    await core.handleCallback({
      code: "upstream-code-123",
      state: "generated-2",
    });

    await expect(core.handleCallback({
      code: "upstream-code-456",
      state: "generated-2",
    })).rejects.toThrow("OAuth state has already been used.");
  });
});
