import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createServer as createNodeHttpServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { startHttpServer } from "./httpServer.js";

describe("oauth broker persistence", () => {
  const cleanups: Array<() => Promise<void>> = [];
  const ynab = {
    apiToken: "test-token",
  } as const;

  async function startUpstreamOAuthServer() {
    const server = createNodeHttpServer((req, res) => {
      const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

      if (requestUrl.pathname === "/authorize") {
        res.statusCode = 200;
        res.end("ok");
        return;
      }

      if (requestUrl.pathname === "/jwks") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ keys: [] }));
        return;
      }

      if (requestUrl.pathname === "/token" && req.method === "POST") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          access_token: "upstream-access-token",
          expires_in: 3600,
          refresh_token: "upstream-refresh-token",
          scope: "openid profile",
          token_type: "Bearer",
        }));
        return;
      }

      res.statusCode = 404;
      res.end();
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Upstream OAuth test server did not expose a TCP address");
    }

    const origin = `http://127.0.0.1:${address.port}`;
    cleanups.push(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    });

    return {
      authorizationUrl: `${origin}/authorize`,
      issuer: origin,
      jwksUrl: `${origin}/jwks`,
      tokenUrl: `${origin}/token`,
    };
  }

  function createCloudflareOAuthAuth(storePath: string, overrides: Record<string, string> = {}) {
    return {
      audience: "https://mcp.example.com/mcp",
      authorizationUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization",
      callbackPath: "/oauth/callback",
      clientId: "cloudflare-client-id",
      clientSecret: "cloudflare-client-secret",
      issuer: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123",
      jwksUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/jwks",
      mode: "oauth" as const,
      publicUrl: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      storePath,
      tokenSigningSecret: "test-oauth-signing-secret",
      tokenUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token",
      ...overrides,
    };
  }

  function createCodeChallenge(codeVerifier: string) {
    return createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
  }

  async function registerOAuthClient(httpServerUrl: string) {
    const registrationResponse = await fetch(new URL("/register", httpServerUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
      },
      body: JSON.stringify({
        client_name: "Claude Web",
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: ["https://claude.ai/oauth/callback"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    });

    expect(registrationResponse.status).toBe(201);
    return await registrationResponse.json() as {
      client_id: string;
    };
  }

  async function startAuthorization(httpServerUrl: string, clientId: string, codeChallenge = "test-challenge") {
    return await fetch(new URL(
      `/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent("https://claude.ai/oauth/callback")}&response_type=code&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256&scope=${encodeURIComponent("openid profile")}&state=client-state-123&resource=${encodeURIComponent("https://mcp.example.com/mcp")}`,
      httpServerUrl,
    ), {
      redirect: "manual",
      headers: {
        Origin: "https://claude.ai",
      },
    });
  }

  async function approveAuthorizationConsent(httpServerUrl: string, consentBody: string) {
    const challengeMatch = consentBody.match(/name="consent_challenge" value="([^"]+)"/);

    expect(challengeMatch?.[1]).toBeTruthy();

    return await fetch(new URL("/authorize/consent", httpServerUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        action: "approve",
        consent_challenge: challengeMatch![1],
      }),
      redirect: "manual",
    });
  }

  afterEach(async () => {
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

    const upstream = await startUpstreamOAuthServer();
    let httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth(storePath, upstream),
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
      auth: createCloudflareOAuthAuth(storePath, upstream),
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

  it("keeps unapproved clients on the consent screen after restart", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "ynab-mcp-oauth-store-"));
    const storePath = path.join(tempDir, "oauth-store.json");
    cleanups.push(async () => {
      await rm(tempDir, { force: true, recursive: true });
    });

    const upstream = await startUpstreamOAuthServer();
    let httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth(storePath, upstream),
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
      auth: createCloudflareOAuthAuth(storePath, upstream),
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

    const upstream = await startUpstreamOAuthServer();
    const codeVerifier = "test-code-verifier-123456789";
    const codeChallenge = createCodeChallenge(codeVerifier);
    let httpServer = await startHttpServer({
      ynab,
      auth: createCloudflareOAuthAuth(storePath, upstream),
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
      auth: createCloudflareOAuthAuth(storePath, upstream),
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
      auth: createCloudflareOAuthAuth(storePath, upstream),
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
        redirect_uri: "https://claude.ai/oauth/callback",
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
      auth: createCloudflareOAuthAuth(storePath, upstream),
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
