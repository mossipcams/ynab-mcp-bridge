import { createServer as createNodeHttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import { createCloudflareAccessCompatibilityMiddleware } from "./cloudflareCompatibility.js";
import { createMcpAuthModule } from "./mcpAuthServer.js";
import { createCloudflareOAuthAuth } from "./oauthTestHelpers.js";

describe("createCloudflareAccessCompatibilityMiddleware", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("converts a trusted Cloudflare Access assertion into a local bridge token", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);

    jwk.kid = "cf-access-test-key";

    const jwksServer = createNodeHttpServer((req, res) => {
      if (req.url !== "/jwks") {
        res.statusCode = 404;
        res.end();
        return;
      }

      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        keys: [jwk],
      }));
    });

    await new Promise<void>((resolve, reject) => {
      jwksServer.once("error", reject);
      jwksServer.listen(0, "127.0.0.1", () => {
        jwksServer.off("error", reject);
        resolve();
      });
    });

    cleanups.push(async () => {
      await new Promise<void>((resolve, reject) => {
        jwksServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    });

    const jwksAddress = jwksServer.address();

    if (!jwksAddress || typeof jwksAddress === "string") {
      throw new Error("JWKS test server did not expose a TCP address");
    }

    const auth = createCloudflareOAuthAuth({
      jwksUrl: `http://127.0.0.1:${jwksAddress.port}/jwks`,
      tokenSigningSecret: "test-local-signing-secret",
    });
    const mcpAuthModule = createMcpAuthModule(auth);
    const compatibilityMiddleware = createCloudflareAccessCompatibilityMiddleware(auth);
    const app = express();

    app.use(compatibilityMiddleware);
    app.post("/mcp", mcpAuthModule.authMiddleware, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const appServer = app.listen(0, "127.0.0.1");
    cleanups.push(async () => {
      await new Promise<void>((resolve, reject) => {
        appServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    });

    await new Promise<void>((resolve, reject) => {
      appServer.once("error", reject);
      appServer.once("listening", () => {
        appServer.off("error", reject);
        resolve();
      });
    });

    const appAddress = appServer.address();

    if (!appAddress || typeof appAddress === "string") {
      throw new Error("Compatibility test server did not expose a TCP address");
    }

    const origin = `http://127.0.0.1:${(appAddress as AddressInfo).port}`;
    const upstreamToken = await new SignJWT({
      client_id: "client-123",
      scope: "openid profile",
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: "cf-access-test-key",
      })
      .setIssuedAt()
      .setIssuer(auth.issuer)
      .setAudience(auth.audience)
      .setExpirationTime("5 minutes")
      .setSubject("user-123")
      .sign(privateKey);

    const response = await fetch(new URL("/mcp", origin), {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": upstreamToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(200);
  });
});
