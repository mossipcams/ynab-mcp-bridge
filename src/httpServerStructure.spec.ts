import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");

describe("http server structure", () => {
  it("keeps the http server entrypoint as orchestration over route modules", () => {
    const source = readFileSync(path.join(projectRoot, "src", "httpServer.ts"), "utf8");

    expect(source).toContain('from "./httpServerIngress.js"');
    expect(source).toContain('from "./httpServerOAuthRoutes.js"');
    expect(source).toContain('from "./httpServerTransportRoutes.js"');
    expect(source).toContain("registerHttpServerIngress(");
    expect(source).toContain("registerOAuthHttpRoutes(");
    expect(source).toContain("registerMcpTransportRoutes(");
    expect(source.split("\n").length).toBeLessThan(750);
  });
});
