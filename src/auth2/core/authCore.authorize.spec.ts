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
      issuer: "https://id.example.com",
      tokenEndpoint: "https://id.example.com/oauth/token",
      usePkce: true,
    },
    publicBaseUrl: "https://mcp.example.com",
    refreshTokenTtlSec: 2_592_000,
  });
}

describe("auth core authorize flow", () => {
  it("validates the request, stores a transaction, and returns an upstream redirect", () => {
    const store = createInMemoryAuthStore();
    const calls: Array<Record<string, unknown>> = [];
    let nextId = 0;
    const core = createAuthCore({
      config: createConfig(),
      createId: () => `generated-${++nextId}`,
      now: () => 1_700_000_000_000,
      provider: {
        buildAuthorizationUrl(input) {
          calls.push(input);
          return `https://id.example.com/oauth/authorize?state=${encodeURIComponent(input.state)}`;
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

    const result = core.startAuthorization({
      clientId: "client-a",
      codeChallenge: "downstream-challenge",
      codeChallengeMethod: "S256",
      redirectUri: "https://claude.ai/oauth/callback",
      responseType: "code",
      scopes: ["openid"],
      state: "downstream-state",
    });

    expect(result).toEqual({
      redirectTo: "https://id.example.com/oauth/authorize?state=generated-2",
      transactionId: "generated-1",
    });
    expect(store.getTransaction("generated-1")).toMatchObject({
      clientId: "client-a",
      downstreamCodeChallenge: "downstream-challenge",
      downstreamCodeChallengeMethod: "S256",
      downstreamState: "downstream-state",
      redirectUri: "https://claude.ai/oauth/callback",
      scopes: ["openid"],
      transactionId: "generated-1",
      upstreamCodeVerifier: "upstream-verifier",
      upstreamState: "generated-2",
    });
    expect(store.getPendingState("generated-2")).toMatchObject({
      transactionId: "generated-1",
      used: false,
    });
    expect(calls).toEqual([
      {
        callbackUri: "https://mcp.example.com/oauth/callback",
        clientId: "provider-client-id",
        codeChallenge: "upstream-challenge",
        codeChallengeMethod: "S256",
        scopes: ["openid"],
        state: "generated-2",
      },
    ]);
  });

  it("rejects a non-code response_type", () => {
    const core = createAuthCore({
      config: createConfig(),
      createId: () => "generated",
      now: () => 1_700_000_000_000,
      provider: {
        buildAuthorizationUrl() {
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

    expect(() => core.startAuthorization({
      clientId: "client-a",
      codeChallenge: "downstream-challenge",
      codeChallengeMethod: "S256",
      redirectUri: "https://claude.ai/oauth/callback",
      responseType: "token",
      scopes: ["openid"],
    })).toThrow("response_type must be code.");
  });

  it("rejects a non-S256 code_challenge_method", () => {
    const core = createAuthCore({
      config: createConfig(),
      createId: () => "generated",
      now: () => 1_700_000_000_000,
      provider: {
        buildAuthorizationUrl() {
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

    expect(() => core.startAuthorization({
      clientId: "client-a",
      codeChallenge: "downstream-challenge",
      codeChallengeMethod: "plain",
      redirectUri: "https://claude.ai/oauth/callback",
      responseType: "code",
      scopes: ["openid"],
    })).toThrow("code_challenge_method must be S256.");
  });
});
