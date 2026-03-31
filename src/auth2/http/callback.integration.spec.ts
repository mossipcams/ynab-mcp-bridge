import { afterEach, describe, expect, it } from "vitest";

import { startHttpServer } from "../../httpTransport.js";
import { createCloudflareOAuthAuth, createCodeChallenge, startUpstreamOAuthServer } from "../../oauthTestHelpers.js";
import { parseAuthConfig } from "../config/schema.js";

describe("auth2 callback route", () => {
  const cleanups: Array<() => Promise<void>> = [];
  const ynab = {
    apiToken: "test-token",
  } as const;

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("handles the upstream callback and redirects back with a local authorization code", async () => {
    const upstream = await startUpstreamOAuthServer(cleanups);
    const server = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      auth2Config: parseAuthConfig({
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
          authorizationEndpoint: upstream.authorizationUrl,
          clientId: "cloudflare-client-id",
          clientSecret: "cloudflare-client-secret",
          issuer: upstream.issuer,
          jwksUri: upstream.jwksUrl,
          tokenEndpoint: upstream.tokenUrl,
          usePkce: true,
        },
        publicBaseUrl: "http://127.0.0.1",
        refreshTokenTtlSec: 2_592_000,
      }),
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
      ynab,
    });
    cleanups.push(() => server.close());

    const authorize = await fetch(new URL(
      `/authorize?client_id=client-a&redirect_uri=${encodeURIComponent("https://claude.ai/oauth/callback")}&response_type=code&code_challenge=${encodeURIComponent(createCodeChallenge("client-a-verifier"))}&code_challenge_method=S256&scope=${encodeURIComponent("openid profile")}&state=client-state-123`,
      server.url,
    ), {
      headers: {
        Origin: "https://claude.ai",
      },
      redirect: "manual",
    });
    const upstreamLocation = authorize.headers.get("location");

    expect(authorize.status).toBe(302);
    expect(upstreamLocation).toBeTruthy();
    const upstreamState = new URL(upstreamLocation!).searchParams.get("state");

    const callback = await fetch(new URL(
      `/oauth/callback?code=upstream-code-123&state=${encodeURIComponent(upstreamState!)}`,
      server.url,
    ), {
      headers: {
        Origin: "https://claude.ai",
      },
      redirect: "manual",
    });

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toContain("https://claude.ai/oauth/callback?code=");
    expect(callback.headers.get("location")).toContain("&state=client-state-123");
  });
});
