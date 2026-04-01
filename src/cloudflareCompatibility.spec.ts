import { createServer as createNodeHttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import { createCloudflareAccessCompatibilityMiddleware } from "./cloudflareCompatibility.js";
import { createCloudflareOAuthAuth } from "./oauthTestHelpers.js";
import { createLocalTokenService } from "./localTokenService.js";

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
    const compatibilityMiddleware = createCloudflareAccessCompatibilityMiddleware(auth);
    const localTokenService = createLocalTokenService({
      allowedAudiences: [auth.audience, auth.publicUrl],
      issuer: new URL(new URL(auth.publicUrl).origin).href,
      tokenSecret: Buffer.from(auth.tokenSigningSecret!, "utf8"),
    });
    const app = express();

    app.use(compatibilityMiddleware);
    app.post("/mcp", async (req, res) => {
      const authorization = req.headers.authorization;

      if (!authorization?.startsWith("Bearer ")) {
        res.status(401).json({ error: "missing bearer token" });
        return;
      }

      const verifiedToken = await localTokenService.verifyAccessToken(authorization.slice("Bearer ".length));

      res.status(200).json({
        clientId: verifiedToken.clientId,
        ok: true,
        subject: verifiedToken.extra?.["subject"],
      });
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
      scope: "openid profile offline_access",
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
    await expect(response.json()).resolves.toMatchObject({
      clientId: "client-123",
      ok: true,
      subject: "user-123",
    });
  });
});
