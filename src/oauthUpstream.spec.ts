import { describe, expect, it } from "vitest";

import { createUpstreamClient } from "./oauthUpstream.js";

describe("oauthUpstream", () => {
  it("builds an upstream authorization URL with correct parameters", () => {
    const client = createUpstreamClient({
      authorizationUrl: "https://idp.example.com/authorize",
      clientId: "test-client",
      clientSecret: "test-secret",
      tokenUrl: "https://idp.example.com/token",
    }, "https://mcp.example.com/oauth/callback");

    const url = client.buildUpstreamAuthorizationUrl({
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      upstreamState: "state-123",
    });

    expect(url.searchParams.get("client_id")).toBe("test-client");
    expect(url.searchParams.get("redirect_uri")).toBe("https://mcp.example.com/oauth/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toBe("openid profile");
    expect(url.searchParams.get("resource")).toBe("https://mcp.example.com/mcp");
  });
});
