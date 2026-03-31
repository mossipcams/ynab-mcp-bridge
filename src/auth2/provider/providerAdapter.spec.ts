import { describe, expect, it } from "vitest";

import { createProviderAdapter } from "./providerAdapter.js";
import { parseAuthConfig } from "../config/schema.js";

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

describe("provider adapter", () => {
  it("builds the upstream authorize URL with one strict callback flow", () => {
    const adapter = createProviderAdapter(createConfig(), async () => {
      throw new Error("not used");
    });

    const url = adapter.buildAuthorizationUrl({
      callbackUri: "https://mcp.example.com/oauth/callback",
      clientId: "provider-client-id",
      codeChallenge: "challenge-123",
      codeChallengeMethod: "S256",
      scopes: ["openid", "profile"],
      state: "state-123",
    });

    expect(url).toBe(
      "https://id.example.com/oauth/authorize?client_id=provider-client-id&redirect_uri=https%3A%2F%2Fmcp.example.com%2Foauth%2Fcallback&response_type=code&state=state-123&code_challenge=challenge-123&code_challenge_method=S256&scope=openid+profile",
    );
  });
});
