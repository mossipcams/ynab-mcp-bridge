import { createServer as createNodeHttpServer } from "node:http";
import { PassThrough } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { setLoggerDestinationForTests } from "./logger.js";
import { createUpstreamOAuthAdapter } from "./upstreamOAuthAdapter.js";

describe("createUpstreamOAuthAdapter", () => {
  const cleanups: Array<() => Promise<void>> = [];

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

  it("builds upstream authorization URLs and exchanges authorization and refresh tokens", async () => {
    const sink = createBufferedDestination();
    setLoggerDestinationForTests(sink.destination);
    let lastRequestBody: URLSearchParams | undefined;
    const server = createNodeHttpServer((req, res) => {
      const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

      if (requestUrl.pathname === "/token" && req.method === "POST") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on("end", () => {
          lastRequestBody = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({
            access_token: "upstream-access-token",
            expires_in: 3600,
            refresh_token: "upstream-refresh-token",
            scope: "openid profile",
            token_type: "Bearer",
          }));
        });
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

    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Test server did not expose a TCP address");
    }

    const origin = `http://127.0.0.1:${address.port}`;
    const adapter = createUpstreamOAuthAdapter({
      authorizationUrl: `${origin}/authorize`,
      callbackUrl: "https://mcp.example.com/oauth/callback",
      clientId: "cloudflare-client-id",
      clientSecret: "cloudflare-client-secret",
      tokenUrl: `${origin}/token`,
    });

    const authorizationUrl = adapter.buildAuthorizationUrl({
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      upstreamState: "upstream-state-123",
    });

    expect(authorizationUrl.href).toBe(
      `${origin}/authorize?client_id=cloudflare-client-id&redirect_uri=${encodeURIComponent("https://mcp.example.com/oauth/callback")}&response_type=code&state=upstream-state-123&scope=openid+profile&resource=${encodeURIComponent("https://mcp.example.com/mcp")}`,
    );

    await expect(adapter.exchangeAuthorizationCode("upstream-code-123")).resolves.toMatchObject({
      access_token: "upstream-access-token",
      refresh_token: "upstream-refresh-token",
      token_type: "Bearer",
    });
    expect(lastRequestBody?.get("grant_type")).toBe("authorization_code");
    expect(lastRequestBody?.get("code")).toBe("upstream-code-123");
    expect(lastRequestBody?.get("client_id")).toBe("cloudflare-client-id");
    expect(lastRequestBody?.get("client_secret")).toBe("cloudflare-client-secret");
    expect(lastRequestBody?.get("redirect_uri")).toBe("https://mcp.example.com/oauth/callback");

    await expect(adapter.exchangeRefreshToken("upstream-refresh-token")).resolves.toMatchObject({
      access_token: "upstream-access-token",
      refresh_token: "upstream-refresh-token",
      token_type: "Bearer",
    });
    expect(lastRequestBody?.get("grant_type")).toBe("refresh_token");
    expect(lastRequestBody?.get("refresh_token")).toBe("upstream-refresh-token");
    expect(lastRequestBody?.get("client_id")).toBe("cloudflare-client-id");
    expect(lastRequestBody?.get("client_secret")).toBe("cloudflare-client-secret");
    expect(sink.readEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "upstream.token.request.started",
        grantType: "authorization_code",
        hasClientSecretInput: true,
        hasCode: true,
        hasRedirectUri: true,
        msg: "upstream.token.request.started",
        scope: "oauth",
        upstreamPath: "/token",
      }),
      expect.objectContaining({
        event: "upstream.token.request.succeeded",
        grantType: "authorization_code",
        hasAccessToken: true,
        hasExpiresIn: true,
        hasRefreshToken: true,
        hasScope: true,
        hasTokenType: true,
        msg: "upstream.token.request.succeeded",
        scope: "oauth",
        upstreamStatus: 200,
      }),
      expect.objectContaining({
        event: "upstream.token.request.started",
        grantType: "refresh_token",
        hasClientSecretInput: true,
        hasRefreshToken: true,
        msg: "upstream.token.request.started",
        scope: "oauth",
        upstreamPath: "/token",
      }),
      expect.objectContaining({
        event: "upstream.token.request.succeeded",
        grantType: "refresh_token",
        hasAccessToken: true,
        hasExpiresIn: true,
        hasRefreshToken: true,
        hasScope: true,
        hasTokenType: true,
        msg: "upstream.token.request.succeeded",
        scope: "oauth",
        upstreamStatus: 200,
      }),
    ]));
    expect(sink.readEntries()).toEqual(expect.not.arrayContaining([
      expect.objectContaining({
        code: "upstream-code-123",
      }),
      expect.objectContaining({
        clientSecret: "cloudflare-client-secret",
      }),
      expect.objectContaining({
        refreshToken: "upstream-refresh-token",
      }),
      expect.objectContaining({
        accessToken: "upstream-access-token",
      }),
    ]));
  });

  it("surfaces safe upstream token error details on refresh failures", async () => {
    const sink = createBufferedDestination();
    setLoggerDestinationForTests(sink.destination);
    const server = createNodeHttpServer((req, res) => {
      const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

      if (requestUrl.pathname === "/token" && req.method === "POST") {
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          error: "invalid_grant",
          error_description: "Refresh token is invalid.",
          refresh_token: "secret-value-that-must-not-be-logged",
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

    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Test server did not expose a TCP address");
    }

    const origin = `http://127.0.0.1:${address.port}`;
    const adapter = createUpstreamOAuthAdapter({
      authorizationUrl: `${origin}/authorize`,
      callbackUrl: "https://mcp.example.com/oauth/callback",
      clientId: "cloudflare-client-id",
      clientSecret: "cloudflare-client-secret",
      tokenUrl: `${origin}/token`,
    });

    await expect(adapter.exchangeRefreshToken("upstream-refresh-token")).rejects.toMatchObject({
      message: "Upstream refresh exchange failed with status 400.",
      name: "ServerError",
      upstreamError: "invalid_grant",
      upstreamErrorDescription: "Refresh token is invalid.",
      upstreamErrorFields: ["error", "error_description"],
    });
    expect(sink.readEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "upstream.token.request.started",
        grantType: "refresh_token",
        hasRefreshToken: true,
        msg: "upstream.token.request.started",
        scope: "oauth",
      }),
      expect.objectContaining({
        event: "upstream.token.request.failed",
        failureKind: "http_error",
        grantType: "refresh_token",
        hasRefreshToken: true,
        msg: "upstream.token.request.failed",
        scope: "oauth",
        upstreamError: "invalid_grant",
        upstreamErrorDescription: "Refresh token is invalid.",
        upstreamStatus: 400,
      }),
    ]));
    expect(sink.readEntries()).toEqual(expect.not.arrayContaining([
      expect.objectContaining({
        refreshToken: "upstream-refresh-token",
      }),
      expect.objectContaining({
        clientSecret: "cloudflare-client-secret",
      }),
    ]));
  });

  it("surfaces a safe server error when a successful token exchange returns invalid JSON", async () => {
    const sink = createBufferedDestination();
    setLoggerDestinationForTests(sink.destination);
    const server = createNodeHttpServer((req, res) => {
      const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

      if (requestUrl.pathname === "/token" && req.method === "POST") {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end("{not-valid-json");
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

    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Test server did not expose a TCP address");
    }

    const origin = `http://127.0.0.1:${address.port}`;
    const adapter = createUpstreamOAuthAdapter({
      authorizationUrl: `${origin}/authorize`,
      callbackUrl: "https://mcp.example.com/oauth/callback",
      clientId: "cloudflare-client-id",
      clientSecret: "cloudflare-client-secret",
      tokenUrl: `${origin}/token`,
    });

    await expect(adapter.exchangeAuthorizationCode("upstream-code-123")).rejects.toMatchObject({
      message: "Upstream token exchange returned an invalid JSON response.",
      name: "ServerError",
    });
    expect(sink.readEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "upstream.token.request.failed",
        failureKind: "invalid_json",
        grantType: "authorization_code",
        hasCode: true,
        msg: "upstream.token.request.failed",
        scope: "oauth",
        upstreamStatus: 200,
      }),
    ]));
  });

  it("surfaces a safe server error when the upstream token endpoint cannot be reached", async () => {
    const sink = createBufferedDestination();
    setLoggerDestinationForTests(sink.destination);
    const server = createNodeHttpServer((_req, res) => {
      res.statusCode = 204;
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
      throw new Error("Test server did not expose a TCP address");
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    const origin = `http://127.0.0.1:${address.port}`;
    const adapter = createUpstreamOAuthAdapter({
      authorizationUrl: `${origin}/authorize`,
      callbackUrl: "https://mcp.example.com/oauth/callback",
      clientId: "cloudflare-client-id",
      clientSecret: "cloudflare-client-secret",
      tokenUrl: `${origin}/token`,
    });

    await expect(adapter.exchangeRefreshToken("upstream-refresh-token")).rejects.toMatchObject({
      message: "Upstream refresh exchange failed due to a network error.",
      name: "ServerError",
    });
    expect(sink.readEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "upstream.token.request.failed",
        failureKind: "network_error",
        grantType: "refresh_token",
        hasRefreshToken: true,
        msg: "upstream.token.request.failed",
        scope: "oauth",
      }),
    ]));
  });
});
