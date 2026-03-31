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
    const oauthRuntimeSource = readFileSync(new URL("./oauthRuntime.ts", import.meta.url), "utf8");
    const grantPersistenceSource = readFileSync(new URL("./grantPersistence.ts", import.meta.url), "utf8");
    const oauthGrantSource = readFileSync(new URL("./oauthGrant.ts", import.meta.url), "utf8");

    expect(httpTransportSource).not.toContain("function getCanonicalOAuthDiscoveryPath");
    expect(httpTransportSource).not.toContain("getCanonicalOAuthDiscoveryPath,");
    expect(httpTransportSource).not.toContain('from "./clientProfiles/types.js"');
    expect(httpTransportSource).not.toContain("getPersistedOAuthProfileReason(");
    expect(oauthRuntimeSource).not.toContain("getCanonicalOAuthDiscoveryPath:");
    expect(oauthRuntimeSource).not.toContain('resolvedProfile?.profileId !== "chatgpt"');
    expect(oauthRuntimeSource).not.toContain("req.url = canonicalPath");
    expect(oauthRuntimeSource).not.toContain('from "./clientProfiles/types.js"');
    expect(oauthRuntimeSource).not.toContain('from "./clientProfiles/profileContext.js"');
    expect(oauthRuntimeSource).not.toContain('from "./clientProfiles/profileLogger.js"');
    expect(oauthRuntimeSource).not.toContain("getClientCompatibilityProfile:");
    expect(grantPersistenceSource).not.toContain('from "./clientProfiles/types.js"');
    expect(grantPersistenceSource).not.toContain("clientProfiles:");
    expect(grantPersistenceSource).not.toContain("getClientCompatibilityProfile(");
    expect(grantPersistenceSource).not.toContain("saveClientCompatibilityProfile(");
    expect(oauthGrantSource).not.toContain('from "./clientProfiles/types.js"');
    expect(oauthGrantSource).not.toContain("compatibilityProfileId");
  });
});
