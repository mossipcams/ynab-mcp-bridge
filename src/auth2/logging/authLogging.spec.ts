import { createHash } from "node:crypto";
import { PassThrough } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { createAuthCore } from "../core/authCore.js";
import { parseAuthConfig } from "../config/schema.js";
import { createInMemoryAuthStore } from "../store/authStore.js";
import { setLoggerDestinationForTests } from "../../logger.js";

function createBufferedDestination() {
  const destination = new PassThrough();
  const chunks: string[] = [];

  destination.on("data", (chunk) => {
    chunks.push(chunk.toString("utf8"));
  });

  return {
    destination,
    readEntries() {
      return chunks
        .join("")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
    readText() {
      return chunks.join("");
    },
  };
}

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

describe("auth2 logging", () => {
  afterEach(() => {
    setLoggerDestinationForTests();
  });

  it("emits structured auth events without leaking secret material", async () => {
    const sink = createBufferedDestination();
    setLoggerDestinationForTests(sink.destination);

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
            challenge: "upstream-challenge-secret",
            method: "S256",
            verifier: "upstream-verifier-secret",
          };
        },
      },
    });

    const codeVerifier = "challenge-verifier-secret";
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

    core.startAuthorization({
      clientId: "client-a",
      codeChallenge,
      codeChallengeMethod: "S256",
      redirectUri: "https://claude.ai/oauth/callback",
      responseType: "code",
      scopes: ["openid", "profile"],
      state: "downstream-state-secret",
    });

    await core.handleCallback({
      code: "upstream-code-secret",
      state: "generated-2",
    });

    const exchanged = await core.exchangeAuthorizationCode({
      clientId: "client-a",
      code: "generated-3",
      codeVerifier,
      redirectUri: "https://claude.ai/oauth/callback",
    });

    await core.exchangeRefreshToken({
      clientId: "client-a",
      refreshToken: exchanged.refresh_token,
      scopes: ["openid"],
    });

    expect(sink.readEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "auth.authorize.started",
        scope: "auth2",
        clientId: "client-a",
      }),
      expect.objectContaining({
        event: "auth.authorize.redirect_ready",
        scope: "auth2",
        transactionId: "generated-1",
      }),
      expect.objectContaining({
        event: "auth.callback.completed",
        scope: "auth2",
        transactionId: "generated-1",
      }),
      expect.objectContaining({
        event: "auth.token.exchange.succeeded",
        scope: "auth2",
        clientId: "client-a",
      }),
      expect.objectContaining({
        event: "auth.refresh.exchange.succeeded",
        scope: "auth2",
        clientId: "client-a",
      }),
    ]));

    const loggedText = sink.readText();
    expect(loggedText).not.toContain("provider-access-token");
    expect(loggedText).not.toContain("provider-refresh-token");
    expect(loggedText).not.toContain("provider-refresh-token-2");
    expect(loggedText).not.toContain("challenge-verifier-secret");
    expect(loggedText).not.toContain("upstream-verifier-secret");
    expect(loggedText).not.toContain("generated-2");
    expect(loggedText).not.toContain("generated-3");
    expect(loggedText).not.toContain("generated-4");
    expect(loggedText).not.toContain("generated-5");
    expect(loggedText).not.toContain("downstream-state-secret");
  });
});
