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

async function issueRefreshToken(core: ReturnType<typeof createAuthCore>) {
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

  return await core.exchangeAuthorizationCode({
    clientId: "client-a",
    code: "generated-3",
    codeVerifier,
    redirectUri: "https://claude.ai/oauth/callback",
  });
}

describe("auth core refresh flow", () => {
  it("rotates refresh tokens and allows scope narrowing", async () => {
    let nextId = 0;
    const providerRefreshCalls: string[] = [];
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
        async exchangeRefreshToken(input) {
          providerRefreshCalls.push(input.refreshToken);
          return {
            access_token: "provider-access-token-2",
            refresh_token: "provider-refresh-token-2",
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

    const firstTokens = await issueRefreshToken(core);
    const refreshed = await core.exchangeRefreshToken({
      clientId: "client-a",
      refreshToken: firstTokens.refresh_token,
      scopes: ["openid"],
    });

    expect(providerRefreshCalls).toEqual(["provider-refresh-token"]);
    expect(refreshed).toEqual({
      access_token: "generated-7",
      expires_in: 3600,
      refresh_token: "generated-8",
      scope: "openid",
      token_type: "Bearer",
    });
  });

  it("allows one retry with the previously-used refresh token and then retires the older token", async () => {
    let nextId = 0;
    const providerRefreshCalls: string[] = [];
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
        async exchangeRefreshToken(input) {
          providerRefreshCalls.push(input.refreshToken);
          return {
            access_token: "provider-access-token-2",
            refresh_token: "provider-refresh-token-2",
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

    const firstTokens = await issueRefreshToken(core);
    const secondTokens = await core.exchangeRefreshToken({
      clientId: "client-a",
      refreshToken: firstTokens.refresh_token,
    });
    const retriedTokens = await core.exchangeRefreshToken({
      clientId: "client-a",
      refreshToken: firstTokens.refresh_token,
    });
    await expect(core.exchangeRefreshToken({
      clientId: "client-a",
      refreshToken: secondTokens.refresh_token,
    })).rejects.toThrow("Refresh token is no longer active.");
    const fourthTokens = await core.exchangeRefreshToken({
      clientId: "client-a",
      refreshToken: retriedTokens.refresh_token,
    });

    await expect(core.exchangeRefreshToken({
      clientId: "client-a",
      refreshToken: firstTokens.refresh_token,
    })).rejects.toThrow("Refresh token is no longer active.");

    expect(secondTokens.refresh_token).not.toBe(firstTokens.refresh_token);
    expect(retriedTokens.refresh_token).not.toBe(secondTokens.refresh_token);
    expect(fourthTokens.refresh_token).not.toBe(retriedTokens.refresh_token);
    expect(providerRefreshCalls).toEqual([
      "provider-refresh-token",
      "provider-refresh-token-2",
      "provider-refresh-token-2",
    ]);
  });

  it("rejects an expired refresh token", async () => {
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
        async exchangeRefreshToken() {
          return {
            access_token: "provider-access-token-2",
            refresh_token: "provider-refresh-token-2",
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

    const firstTokens = await issueRefreshToken(core);
    currentTime = 1_702_592_001_000;

    await expect(core.exchangeRefreshToken({
      clientId: "client-a",
      refreshToken: firstTokens.refresh_token,
    })).rejects.toThrow("Refresh token has expired.");
  });

  it("issues new tokens on refresh when upstream never provided a refresh token", async () => {
    let nextId = 0;
    const providerRefreshCalls: string[] = [];
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
            subject: "user-123",
            token_type: "Bearer",
          };
        },
        async exchangeRefreshToken(input) {
          providerRefreshCalls.push(input.refreshToken);
          return {
            access_token: "provider-access-token-2",
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

    const firstTokens = await issueRefreshToken(core);
    const refreshed = await core.exchangeRefreshToken({
      clientId: "client-a",
      refreshToken: firstTokens.refresh_token,
      scopes: ["openid"],
    });

    expect(providerRefreshCalls).toEqual([]);
    expect(refreshed).toEqual({
      access_token: "generated-7",
      expires_in: 3600,
      refresh_token: "generated-8",
      scope: "openid",
      token_type: "Bearer",
    });
  });

  it("rejects a scope expansion on refresh", async () => {
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
        async exchangeRefreshToken() {
          return {
            access_token: "provider-access-token-2",
            refresh_token: "provider-refresh-token-2",
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

    const firstTokens = await issueRefreshToken(core);

    await expect(core.exchangeRefreshToken({
      clientId: "client-a",
      refreshToken: firstTokens.refresh_token,
      scopes: ["openid", "email"],
    })).rejects.toThrow("Requested scope exceeds the original grant.");
  });
});
