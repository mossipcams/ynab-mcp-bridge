import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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

describe("oauth broker persistence", () => {
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

  afterEach(async () => {
    setLoggerDestinationForTests();

    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      await cleanup?.();
    }
  });

  it("persists registered clients across restart and keeps authorization on the direct redirect path", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "ynab-mcp-oauth-store-"));
    const storePath = path.join(tempDir, "oauth-store.json");
    cleanups.push(async () => {
      await rm(tempDir, { force: true, recursive: true });
    });

    const upstream = await startUpstreamOAuthServer(cleanups);
    let httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        ...upstream,
        storePath,
        tokenSigningSecret: "test-oauth-signing-secret",
      }),
      auth2Config: createAuth2Config(upstream),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const registration = await registerOAuthClient(httpServer.url);
    const firstAuthorizeResponse = await startAuthorization(httpServer.url, registration.client_id);
    expect(firstAuthorizeResponse.status).toBe(302);
    expect(firstAuthorizeResponse.headers.get("location")).toContain(upstream.authorizationUrl);

    await httpServer.close();
    cleanups.pop();

    httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        ...upstream,
        storePath,
        tokenSigningSecret: "test-oauth-signing-secret",
      }),
      auth2Config: createAuth2Config(upstream),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const secondAuthorizeResponse = await startAuthorization(httpServer.url, registration.client_id);

    expect(secondAuthorizeResponse.status).toBe(302);
    expect(secondAuthorizeResponse.headers.get("location")).toContain(upstream.authorizationUrl);
  });

  it("keeps legacy oauthRuntime helpers available without owning the live HTTP OAuth route stack", () => {
    const oauthRuntimeSource = readFileSync(new URL("./oauthRuntime.ts", import.meta.url), "utf8");
    const httpTransportSource = readFileSync(new URL("./httpTransport.ts", import.meta.url), "utf8");

    expect(oauthRuntimeSource).toContain("export function createOAuthBroker");
    expect(oauthRuntimeSource).toContain("export function createMcpAuthModule");
    expect(oauthRuntimeSource).toContain("handleCallback");
    expect(oauthRuntimeSource).toContain("handleConsent");
    expect(httpTransportSource).not.toContain('from "./oauthRuntime.js"');
    expect(httpTransportSource).not.toContain("installOAuthRoutes(");
  });

  it("logs callback failures through the auth2 logger", async () => {
    const sink = createBufferedDestination();
    setLoggerDestinationForTests(sink.destination);

    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        ...upstream,
        tokenSigningSecret: "test-oauth-signing-secret",
      }),
      auth2Config: createAuth2Config(upstream),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const response = await fetch(new URL("/oauth/callback?code=upstream-code-123", httpServer.url), {
      headers: {
        Origin: "https://claude.ai",
      },
    });

    expect(response.status).toBe(400);
    expect(sink.readEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        errorMessage: "Missing upstream OAuth state.",
        event: "auth.callback.failed",
        msg: "auth.callback.failed",
        scope: "auth2",
      }),
    ]));
  });

  it("logs direct auth2 authorization events through the shared logger", async () => {
    const sink = createBufferedDestination();
    setLoggerDestinationForTests(sink.destination);

    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        ...upstream,
        tokenSigningSecret: "test-oauth-signing-secret",
      }),
      auth2Config: createAuth2Config(upstream),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const registration = await registerOAuthClient(httpServer.url);
    const response = await startAuthorization(httpServer.url, registration.client_id);

    expect(response.status).toBe(302);
    expect(sink.readEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientId: registration.client_id,
        event: "auth.authorize.started",
        msg: "auth.authorize.started",
        scope: "auth2",
      }),
      expect.objectContaining({
        event: "auth.http.authorize.redirected",
        msg: "auth.http.authorize.redirected",
        route: "/authorize",
        scope: "auth2",
      }),
    ]));
  });

  it("keeps registered clients authorizable after restart before any callback completes", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "ynab-mcp-oauth-store-"));
    const storePath = path.join(tempDir, "oauth-store.json");
    cleanups.push(async () => {
      await rm(tempDir, { force: true, recursive: true });
    });

    const upstream = await startUpstreamOAuthServer(cleanups);
    let httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        ...upstream,
        storePath,
        tokenSigningSecret: "test-oauth-signing-secret",
      }),
      auth2Config: createAuth2Config(upstream),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const registration = await registerOAuthClient(httpServer.url);

    await httpServer.close();
    cleanups.pop();

    httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        ...upstream,
        storePath,
        tokenSigningSecret: "test-oauth-signing-secret",
      }),
      auth2Config: createAuth2Config(upstream),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id);

    expect(authorizeResponse.status).toBe(302);
    expect(authorizeResponse.headers.get("location")).toContain(upstream.authorizationUrl);
  });

  it("persists pending authorization, local authorization codes, refresh tokens, and signed access tokens across restart", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "ynab-mcp-oauth-store-"));
    const storePath = path.join(tempDir, "oauth-store.json");
    cleanups.push(async () => {
      await rm(tempDir, { force: true, recursive: true });
    });

    const upstream = await startUpstreamOAuthServer(cleanups);
    const codeVerifier = "test-code-verifier-123456789";
    const codeChallenge = createCodeChallenge(codeVerifier);
    let httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        ...upstream,
        storePath,
        tokenSigningSecret: "test-oauth-signing-secret",
      }),
      auth2Config: createAuth2Config(upstream),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const registration = await registerOAuthClient(httpServer.url);
    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id, codeChallenge);
    const upstreamState = new URL(authorizeResponse.headers.get("location")!).searchParams.get("state");

    expect(upstreamState).toBeTruthy();

    await httpServer.close();
    cleanups.pop();

    httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        ...upstream,
        storePath,
        tokenSigningSecret: "test-oauth-signing-secret",
      }),
      auth2Config: createAuth2Config(upstream),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const callbackResponse = await fetch(new URL(
      `/oauth/callback?code=upstream-code-123&state=${encodeURIComponent(upstreamState!)}`,
      httpServer.url,
    ), {
      redirect: "manual",
      headers: {
        Origin: "https://claude.ai",
      },
    });
    const localAuthorizationCode = new URL(callbackResponse.headers.get("location")!).searchParams.get("code");

    expect(localAuthorizationCode).toBeTruthy();

    await httpServer.close();
    cleanups.pop();

    httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        ...upstream,
        storePath,
        tokenSigningSecret: "test-oauth-signing-secret",
      }),
      auth2Config: createAuth2Config(upstream),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const tokenResponse = await fetch(new URL("/token", httpServer.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        client_id: registration.client_id,
        code: localAuthorizationCode!,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: "https://claude.ai/api/mcp/auth_callback",
        resource: "https://mcp.example.com/mcp",
      }),
    });
    const tokens = await tokenResponse.json() as {
      access_token: string;
      refresh_token: string;
    };

    expect(tokenResponse.status).toBe(200);
    expect(tokens.access_token).toEqual(expect.any(String));
    expect(tokens.refresh_token).toEqual(expect.any(String));

    await httpServer.close();
    cleanups.pop();

    httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        ...upstream,
        storePath,
        tokenSigningSecret: "test-oauth-signing-secret",
      }),
      auth2Config: createAuth2Config(upstream),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const refreshResponse = await fetch(new URL("/token", httpServer.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        client_id: registration.client_id,
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        resource: "https://mcp.example.com/mcp",
      }),
    });

    expect(refreshResponse.status).toBe(200);

    const mcpResponse = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(mcpResponse.status).toBe(200);
  });
});
