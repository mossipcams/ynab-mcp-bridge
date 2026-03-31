import { describe, expect, it } from "vitest";

import { startHttpServer } from "./httpTransport.js";
import { createCloudflareOAuthAuth } from "./oauthTestHelpers.js";

describe("http transport oauth2-only startup", () => {
  it("rejects oauth mode without an auth2 config", async () => {
    await expect(startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      auth: createCloudflareOAuthAuth(),
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
      ynab: {
        apiToken: "test-token",
      },
    })).rejects.toThrow("OAuth HTTP mode requires auth2Config.");
  });
});
