import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("http server structure", () => {
  it("keeps the HTTP runtime owned by httpTransport, auth2 routes, and oauthRuntime helpers", () => {
    const httpTransportSource = readFileSync(new URL("./httpTransport.ts", import.meta.url), "utf8");
    const oauthRuntimeSource = readFileSync(new URL("./oauthRuntime.ts", import.meta.url), "utf8");

    expect(httpTransportSource).toContain('from "./oauthRuntime.js"');
    expect(httpTransportSource).toContain('from "./auth2/http/routes.js"');
    expect(httpTransportSource).toContain('from "./serverRuntime.js"');
    expect(httpTransportSource).toContain("installAuthV2Routes(");
    expect(httpTransportSource).not.toContain("installOAuthRoutes(");
    expect(httpTransportSource).toContain("export function installMcpPostRoute");
    expect(httpTransportSource).toContain('reason: "invalid-session-header"');
    expect(httpTransportSource).toContain('"transport.handoff"');

    expect(oauthRuntimeSource).toContain("export function installOAuthRoutes");
    expect(oauthRuntimeSource).toContain("export function createMcpAuthModule");
  });
});
