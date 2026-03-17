import { describe, expect, it } from "vitest";

import { createJwtService } from "./oauthJwt.js";

describe("oauthJwt", () => {
  it("mints and verifies a local access token round-trip", async () => {
    const secret = Buffer.from("test-secret-that-is-long-enough-for-hs256!!", "utf8");
    const issuerUrl = new URL("https://issuer.example.com");
    const service = createJwtService({
      allowedAudiences: ["https://api.example.com"],
      issuerUrl,
      localTokenSecret: secret,
      publicUrl: "https://api.example.com",
      upstreamAudience: "https://api.example.com",
      upstreamIssuer: "https://upstream.example.com",
      upstreamJwksUrl: "https://upstream.example.com/.well-known/jwks.json",
    });

    const token = await service.mintAccessToken({
      clientId: "client-1",
      expiresInSeconds: 3600,
      resource: "https://api.example.com",
      scopes: ["openid"],
      subject: "user-1",
    });

    const authInfo = await service.verifyAccessToken(token);
    expect(authInfo.clientId).toBe("client-1");
    expect(authInfo.scopes).toEqual(["openid"]);
  });
});
