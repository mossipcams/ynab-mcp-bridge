import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";

import express from "express";
import { afterEach, describe, expect, it } from "vitest";

import { createMcpAuthModule } from "./oauthRuntime.js";
import { createCloudflareOAuthAuth } from "./oauthTestHelpers.js";

describe("createMcpAuthModule", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("mounts OpenID metadata and a bearer challenge for the protected MCP resource", async () => {
    const auth = createCloudflareOAuthAuth();
    const module = createMcpAuthModule(auth);
    const app = express();

    app.use(module.router);
    app.post("/mcp", module.authMiddleware, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const server = app.listen(0, "127.0.0.1");
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

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.once("listening", () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Test auth server did not expose a TCP address");
    }

    const origin = `http://127.0.0.1:${(address as AddressInfo).port}`;
    const metadataResponse = await fetch(new URL("/.well-known/openid-configuration", origin));

    expect(metadataResponse.status).toBe(200);
    await expect(metadataResponse.json()).resolves.toMatchObject({
      authorization_endpoint: "https://mcp.example.com/authorize",
      issuer: "https://mcp.example.com/",
      registration_endpoint: "https://mcp.example.com/register",
      token_endpoint: "https://mcp.example.com/token",
    });

    const mcpResponse = await fetch(new URL("/mcp", origin), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(mcpResponse.status).toBe(401);
    expect(mcpResponse.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("keeps auth module assembly owned by oauthRuntime", () => {
    const oauthRuntimeSource = readFileSync(new URL("./oauthRuntime.ts", import.meta.url), "utf8");

    expect(oauthRuntimeSource).toContain("export function createMcpAuthModule");
    expect(oauthRuntimeSource).toContain("getOpenIdConfiguration");
    expect(oauthRuntimeSource).toContain("mcpAuthRouter(");
  });
});
