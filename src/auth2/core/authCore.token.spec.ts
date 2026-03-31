import { createHash } from "node:crypto";

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

async function createAuthorizationCode(core: ReturnType<typeof createAuthCore>) {
  const codeVerifier = "challenge-verifier";
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  core.startAuthorization({
    clientId: "client-a",
    codeChallenge,
    codeChallengeMethod: "S256",
    redirectUri: "https://claude.ai/oauth/callback",
    responseType: "code",
    scopes: ["openid", "profile"],
  });

  await core.handleCallback({
    code: "upstream-code-123",
    state: "generated-2",
  });

  return "generated-3";
}

describe("auth core token exchange", () => {
  it("redeems a local authorization code with exact redirect_uri and PKCE", async () => {
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

    const localAuthorizationCode = await createAuthorizationCode(core);
    const tokens = await core.exchangeAuthorizationCode({
      clientId: "client-a",
      code: localAuthorizationCode,
      codeVerifier: "challenge-verifier",
      redirectUri: "https://claude.ai/oauth/callback",
    });

    expect(tokens).toEqual({
      access_token: "generated-4",
      expires_in: 3600,
      refresh_token: "generated-5",
      scope: "openid profile",
      token_type: "Bearer",
    });
  });

  it("rejects a reused authorization code", async () => {
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

    const localAuthorizationCode = await createAuthorizationCode(core);

    await core.exchangeAuthorizationCode({
      clientId: "client-a",
      code: localAuthorizationCode,
      codeVerifier: "challenge-verifier",
      redirectUri: "https://claude.ai/oauth/callback",
    });

    await expect(core.exchangeAuthorizationCode({
      clientId: "client-a",
      code: localAuthorizationCode,
      codeVerifier: "challenge-verifier",
      redirectUri: "https://claude.ai/oauth/callback",
    })).rejects.toThrow("Authorization code has already been used.");
  });

  it("rejects an expired authorization code", async () => {
    let nextId = 0;
    let currentTime = 1_700_000_000_000;
    const core = createAuthCore({
      config: createConfig(),
      createId: () => `generated-${++nextId}`,
      now: () => currentTime,
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

    const localAuthorizationCode = await createAuthorizationCode(core);
    currentTime = 1_700_000_301_000;

    await expect(core.exchangeAuthorizationCode({
      clientId: "client-a",
      code: localAuthorizationCode,
      codeVerifier: "challenge-verifier",
      redirectUri: "https://claude.ai/oauth/callback",
    })).rejects.toThrow("Authorization code has expired.");
  });

  it("rejects a mismatched redirect_uri", async () => {
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

    const localAuthorizationCode = await createAuthorizationCode(core);

    await expect(core.exchangeAuthorizationCode({
      clientId: "client-a",
      code: localAuthorizationCode,
      codeVerifier: "challenge-verifier",
      redirectUri: "https://claude.ai/oauth/callback/extra",
    })).rejects.toThrow("redirect_uri does not match the authorization request.");
  });

  it("rejects a mismatched code_verifier", async () => {
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

    const localAuthorizationCode = await createAuthorizationCode(core);

    await expect(core.exchangeAuthorizationCode({
      clientId: "client-a",
      code: localAuthorizationCode,
      codeVerifier: "wrong-verifier",
      redirectUri: "https://claude.ai/oauth/callback",
    })).rejects.toThrow("PKCE code_verifier is invalid.");
  });
});
