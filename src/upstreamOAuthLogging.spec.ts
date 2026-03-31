import { PassThrough } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { parseAuthConfig } from "./auth2/config/schema.js";
import { startHttpServer } from "./httpTransport.js";
import { setLoggerDestinationForTests } from "./logger.js";
import {
  createCloudflareOAuthAuth,
  createCodeChallenge,
  registerOAuthClient,
  startAuthorization,
  startUpstreamOAuthServer,
} from "./oauthTestHelpers.js";

describe("upstream oauth logging", () => {
  const cleanups: Array<() => Promise<void>> = [];
  const ynab = {
    apiToken: "test-token",
  } as const;

  function createAuth2Config(upstream: {
    authorizationUrl: string;
    issuer: string;
    jwksUrl: string;
    tokenUrl: string;
  }) {
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
    });
  }

  afterEach(async () => {
    setLoggerDestinationForTests();

    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

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
    };
  }

  it("logs upstream token exchange details with the originating callback request context", async () => {
    const sink = createBufferedDestination();
    setLoggerDestinationForTests(sink.destination);

    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      auth2Config: createAuth2Config(upstream),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const codeVerifier = "test-code-verifier-123456789";
    const codeChallenge = createCodeChallenge(codeVerifier);
    const registration = await registerOAuthClient(httpServer.url);
    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id, codeChallenge);
    const upstreamState = new URL(authorizeResponse.headers.get("location")!, httpServer.url).searchParams.get("state");

    const callbackResponse = await fetch(new URL(
      `/oauth/callback?code=upstream-code-123&state=${encodeURIComponent(upstreamState!)}`,
      httpServer.url,
    ), {
      redirect: "manual",
      headers: {
        Origin: "https://claude.ai",
      },
    });

    expect(callbackResponse.status).toBe(302);
    expect(sink.readEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        correlationId: expect.any(String),
        event: "upstream.token.request.started",
        grantType: "authorization_code",
        method: "GET",
        msg: "upstream.token.request.started",
        path: "/oauth/callback",
        requestId: expect.any(String),
        scope: "oauth",
      }),
      expect.objectContaining({
        correlationId: expect.any(String),
        event: "upstream.token.request.succeeded",
        grantType: "authorization_code",
        method: "GET",
        msg: "upstream.token.request.succeeded",
        path: "/oauth/callback",
        requestId: expect.any(String),
        scope: "oauth",
        upstreamStatus: 200,
      }),
    ]));
  });
});
