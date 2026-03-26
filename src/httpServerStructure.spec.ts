import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("http server structure", () => {
  it("delegates oauth route setup and mcp request handling to route-scoped modules", () => {
    const source = readFileSync(new URL("./httpServer.ts", import.meta.url), "utf8");

    expect(source).toContain('from "./httpServerOAuthRoutes.js"');
    expect(source).toContain('from "./httpServerMcpRoute.js"');
    expect(source).toContain("installOAuthRoutes(");
    expect(source).toContain("installMcpPostRoute(");
  });
});
