import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("http server structure", () => {
  it("keeps the HTTP runtime owned by httpTransport, auth2 routes, and serverRuntime", () => {
    const httpTransportSource = readFileSync(new URL("./httpTransport.ts", import.meta.url), "utf8");

    expect(httpTransportSource).toContain('from "./auth2/http/routes.js"');
    expect(httpTransportSource).toContain('from "./serverRuntime.js"');
    expect(httpTransportSource).toContain("installAuthV2Routes(");
    expect(httpTransportSource).not.toContain('from "./oauthRuntime.js"');
    expect(httpTransportSource).not.toContain("installOAuthRoutes(");
    expect(httpTransportSource).not.toContain("createMcpAuthModule(");
    expect(httpTransportSource).toContain("export function installMcpPostRoute");
    expect(httpTransportSource).toContain('reason: "invalid-session-header"');
    expect(httpTransportSource).toContain('"transport.handoff"');
  });

  it("does not keep alias discovery rewrites or profile-specific protected-resource routes", () => {
    const httpTransportSource = readFileSync(new URL("./httpTransport.ts", import.meta.url), "utf8");

    expect(httpTransportSource).not.toContain("function getCanonicalOAuthDiscoveryPath");
    expect(httpTransportSource).not.toContain("getCanonicalOAuthDiscoveryPath,");
    expect(httpTransportSource).not.toContain('from "./clientProfiles/types.js"');
    expect(httpTransportSource).not.toContain("getPersistedOAuthProfileReason(");
  });
});
