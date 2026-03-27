import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("http server structure", () => {
  it("keeps the HTTP runtime owned by httpTransport and oauthRuntime", () => {
    const httpTransportSource = readFileSync(new URL("./httpTransport.ts", import.meta.url), "utf8");
    const oauthRuntimeSource = readFileSync(new URL("./oauthRuntime.ts", import.meta.url), "utf8");

    expect(httpTransportSource).toContain('from "./oauthRuntime.js"');
    expect(httpTransportSource).toContain('from "./serverRuntime.js"');
    expect(httpTransportSource).toContain("installOAuthRoutes(");
    expect(httpTransportSource).toContain("export function installMcpPostRoute");
    expect(httpTransportSource).toContain('reason: "invalid-session-header"');
    expect(httpTransportSource).toContain('"transport.handoff"');

    expect(oauthRuntimeSource).toContain("export function installOAuthRoutes");
  });
});
