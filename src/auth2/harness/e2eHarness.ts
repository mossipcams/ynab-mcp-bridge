import { createHash } from "node:crypto";

import { createAuthCore } from "../core/authCore.js";
import { parseAuthConfig } from "../config/schema.js";
import { createInMemoryAuthStore } from "../store/authStore.js";
import { createFakeProvider } from "./fakeProvider.js";

export async function runClientFlowWithFakeProvider(input: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
}) {
  let nextId = 0;
  const fakeProvider = createFakeProvider();
  const codeVerifier = `${input.clientId}-verifier`;
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const core = createAuthCore({
    config: parseAuthConfig({
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
    }),
    createId: () => `generated-${++nextId}`,
    now: () => 1_700_000_000_000,
    provider: fakeProvider.adapter,
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
    clientId: input.clientId,
    codeChallenge,
    codeChallengeMethod: "S256",
    redirectUri: input.redirectUri,
    responseType: "code",
    scopes: input.scopes,
    state: `${input.clientId}-state`,
  });

  const callback = await core.handleCallback({
    code: "upstream-code-123",
    state: "generated-2",
  });
  const tokens = await core.exchangeAuthorizationCode({
    clientId: input.clientId,
    code: "generated-3",
    codeVerifier,
    redirectUri: input.redirectUri,
  });
  const refreshed = await core.exchangeRefreshToken({
    clientId: input.clientId,
    refreshToken: tokens.refresh_token,
    scopes: ["openid"],
  });

  return {
    callbackRedirect: callback.redirectTo,
    providerCalls: fakeProvider.getCalls(),
    refreshScope: refreshed.scope,
    tokenScope: tokens.scope,
  };
}
