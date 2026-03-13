import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { createOAuthTokenVerifier, type OAuthTokenVerifierConfig } from "./oauthVerifier.js";

describe("createOAuthTokenVerifier", () => {
  let privateKey: CryptoKey;
  let verifierConfig: OAuthTokenVerifierConfig;

  beforeAll(async () => {
    const { privateKey: generatedPrivateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);

    jwk.kid = "test-key";

    privateKey = generatedPrivateKey;
    verifierConfig = {
      audience: "https://mcp.example.com",
      issuer: "https://example.cloudflareaccess.com",
      jwksUrl: "https://example.cloudflareaccess.com/cdn-cgi/access/certs",
      scopes: ["openid"],
    };
    (verifierConfig as OAuthTokenVerifierConfig & { jwks: ReturnType<typeof createLocalJWKSet> }).jwks = createLocalJWKSet({
      keys: [jwk],
    });
  });

  async function createAccessToken(overrides: {
    aud?: string;
    exp?: number;
    iss?: string;
    scope?: string;
    sub?: string;
  } = {}) {
    return await new SignJWT({
      client_id: "client-123",
      scope: overrides.scope ?? "openid profile",
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: "test-key",
      })
      .setIssuedAt()
      .setIssuer(overrides.iss ?? verifierConfig.issuer)
      .setAudience(overrides.aud ?? verifierConfig.audience)
      .setExpirationTime(overrides.exp ?? "5 minutes")
      .setSubject(overrides.sub ?? "user-123")
      .sign(privateKey);
  }

  it("accepts a valid token and maps auth info", async () => {
    const verifier = createOAuthTokenVerifier(verifierConfig as OAuthTokenVerifierConfig & {
      jwks: ReturnType<typeof createLocalJWKSet>;
    });
    const token = await createAccessToken();

    await expect(verifier.verifyAccessToken(token)).resolves.toMatchObject({
      clientId: "client-123",
      extra: {
        subject: "user-123",
      },
      resource: new URL("https://mcp.example.com"),
      scopes: ["openid", "profile"],
      token,
    });
  });

  it("rejects a token with the wrong issuer", async () => {
    const verifier = createOAuthTokenVerifier(verifierConfig as OAuthTokenVerifierConfig & {
      jwks: ReturnType<typeof createLocalJWKSet>;
    });
    const token = await createAccessToken({
      iss: "https://evil.example.com",
    });

    await expect(verifier.verifyAccessToken(token)).rejects.toThrow("Invalid token issuer.");
  });

  it("rejects a token with the wrong audience", async () => {
    const verifier = createOAuthTokenVerifier(verifierConfig as OAuthTokenVerifierConfig & {
      jwks: ReturnType<typeof createLocalJWKSet>;
    });
    const token = await createAccessToken({
      aud: "https://other.example.com",
    });

    await expect(verifier.verifyAccessToken(token)).rejects.toThrow("Invalid token audience.");
  });

  it("rejects an expired token", async () => {
    const verifier = createOAuthTokenVerifier(verifierConfig as OAuthTokenVerifierConfig & {
      jwks: ReturnType<typeof createLocalJWKSet>;
    });
    const token = await createAccessToken({
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    await expect(verifier.verifyAccessToken(token)).rejects.toThrow("Token has expired.");
  });

  it("rejects a token that does not include a required scope", async () => {
    const verifier = createOAuthTokenVerifier({
      ...verifierConfig,
      jwks: (verifierConfig as OAuthTokenVerifierConfig & { jwks: ReturnType<typeof createLocalJWKSet> }).jwks,
      scopes: ["openid", "email"],
    });
    const token = await createAccessToken({
      scope: "openid profile",
    });

    await expect(verifier.verifyAccessToken(token)).rejects.toThrow("Token is missing required scopes.");
  });
});
