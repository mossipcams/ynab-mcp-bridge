import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

import { startHttpServer } from "./httpTransport.js";
import { setLoggerDestinationForTests } from "./logger.js";
import {
  approveAuthorizationConsent,
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

  it("persists approved clients across restart and skips repeated consent", async () => {
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
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const registration = await registerOAuthClient(httpServer.url);
    const firstAuthorizeResponse = await startAuthorization(httpServer.url, registration.client_id);
    expect(firstAuthorizeResponse.status).toBe(200);

    const approveResponse = await approveAuthorizationConsent(httpServer.url, await firstAuthorizeResponse.text());
    expect(approveResponse.status).toBe(302);

    await httpServer.close();
    cleanups.pop();

    httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        ...upstream,
        storePath,
        tokenSigningSecret: "test-oauth-signing-secret",
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const secondAuthorizeResponse = await startAuthorization(httpServer.url, registration.client_id);

    expect(secondAuthorizeResponse.status).toBe(302);
    expect(secondAuthorizeResponse.headers.get("location")).toContain("/authorize");
  });

  it("keeps broker runtime ownership in oauthRuntime", () => {
    const oauthRuntimeSource = readFileSync(new URL("./oauthRuntime.ts", import.meta.url), "utf8");

    expect(oauthRuntimeSource).toContain("export function createOAuthBroker");
    expect(oauthRuntimeSource).toContain("export function installOAuthRoutes");
    expect(oauthRuntimeSource).toContain("handleCallback");
    expect(oauthRuntimeSource).toContain("handleConsent");
    expect(oauthRuntimeSource).toContain("verifyAccessToken");
    expect(oauthRuntimeSource).toContain('"/.well-known/oauth-protected-resource"');
    expect(oauthRuntimeSource).toContain('reason: res.statusCode === 403 ? "forbidden-scope" : admission.reason');
  });

  it("logs callback failures through the shared oauth logger", async () => {
    const sink = createBufferedDestination();
    setLoggerDestinationForTests(sink.destination);

    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        ...upstream,
        tokenSigningSecret: "test-oauth-signing-secret",
      }),
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
        event: "callback.failed",
        msg: "callback.failed",
        scope: "oauth",
      }),
    ]));
  });

  it("logs non-callback oauth events through the shared oauth logger", async () => {
    const sink = createBufferedDestination();
    setLoggerDestinationForTests(sink.destination);

    const upstream = await startUpstreamOAuthServer(cleanups);
    const httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth({
        ...upstream,
        tokenSigningSecret: "test-oauth-signing-secret",
      }),
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const registration = await registerOAuthClient(httpServer.url);
    const response = await startAuthorization(httpServer.url, registration.client_id);

    expect(response.status).toBe(200);
    expect(sink.readEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientId: registration.client_id,
        event: "authorize.started",
        msg: "authorize.started",
        scope: "oauth",
      }),
      expect.objectContaining({
        clientId: registration.client_id,
        event: "authorize.consent_required",
        msg: "authorize.consent_required",
        scope: "oauth",
      }),
    ]));
  });

  it("keeps unapproved clients on the consent screen after restart", async () => {
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
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id);

    expect(authorizeResponse.status).toBe(200);
    await expect(authorizeResponse.text()).resolves.toContain("Approve MCP client access");
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
      allowedOrigins: ["https://claude.ai"],
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
    });
    cleanups.push(() => httpServer.close());

    const registration = await registerOAuthClient(httpServer.url);
    const authorizeResponse = await startAuthorization(httpServer.url, registration.client_id, codeChallenge);
    const consentResponse = await approveAuthorizationConsent(httpServer.url, await authorizeResponse.text());
    const upstreamState = new URL(consentResponse.headers.get("location")!).searchParams.get("state");

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
