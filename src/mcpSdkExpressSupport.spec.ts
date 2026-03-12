import { describe, expect, it } from "vitest";

describe("MCP SDK Express support", () => {
  it("exposes the official Express app helper", async () => {
    const expressModule = await import("@modelcontextprotocol/sdk/server/express.js");

    expect(typeof expressModule.createMcpExpressApp).toBe("function");
  });

  it("exposes the official host header validation middleware", async () => {
    const middlewareModule = await import("@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js");

    expect(typeof middlewareModule.hostHeaderValidation).toBe("function");
  });
});
