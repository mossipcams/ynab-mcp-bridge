import { describe, expect, it } from "vitest";

import { createLocalTokenService } from "./localTokenService.js";

describe("createLocalTokenService", () => {
  const issuer = "https://mcp.example.com/";
  const allowedAudiences = ["https://mcp.example.com/mcp", "https://mcp.example.com/mcp/"];
  const tokenSecret = "test-local-token-secret";

  it("mints and verifies local access tokens using the bridge issuer and audience set", async () => {
    const service = createLocalTokenService({
      allowedAudiences,
      issuer,
      tokenSecret,
    });

    const token = await service.mintAccessToken({
      clientId: "client-123",
      expiresInSeconds: 300,
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      subject: "client-123",
    });

    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({
      clientId: "client-123",
      extra: {
        subject: "client-123",
      },
      resource: new URL("https://mcp.example.com/mcp"),
      scopes: ["openid", "profile"],
      token,
    });
  });
});
