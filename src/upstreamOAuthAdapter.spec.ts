import { createServer as createNodeHttpServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { createUpstreamOAuthAdapter } from "./upstreamOAuthAdapter.js";

describe("createUpstreamOAuthAdapter", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("builds upstream authorization URLs and exchanges authorization and refresh tokens", async () => {
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
  });

  it("surfaces safe upstream token error details on refresh failures", async () => {
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
  });

  it("surfaces a safe server error when a successful token exchange returns invalid JSON", async () => {
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
  });

  it("surfaces a safe server error when the upstream token endpoint cannot be reached", async () => {
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
  });
});
