import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("http transport auth installation", () => {
  it("installs auth2 directly as the only oauth route installer", () => {
    const httpTransportSource = readFileSync(new URL("./httpTransport.ts", import.meta.url), "utf8");

    expect(httpTransportSource).toContain('from "./auth2/http/routes.js"');
    expect(httpTransportSource).toContain("installAuthV2Routes({");
    expect(httpTransportSource).not.toContain('from "./oauthRuntime.js"');
    expect(httpTransportSource).not.toContain("installOAuthRoutes(");
    expect(httpTransportSource).not.toContain("createMcpAuthModule(");
    expect(httpTransportSource).not.toContain("authStack?:");
    expect(httpTransportSource).not.toContain("selectAuthRouteInstaller");
    expect(httpTransportSource).not.toContain('from "./auth2/integration.js"');
  });

  it("does not keep request-time client profile detection in the HTTP transport", () => {
    const httpTransportSource = readFileSync(new URL("./httpTransport.ts", import.meta.url), "utf8");

    expect(httpTransportSource).not.toContain('from "./clientProfiles/detectClient.js"');
    expect(httpTransportSource).not.toContain("detectClientProfile(");
    expect(httpTransportSource).not.toContain("detectInitializeClientProfile(");
    expect(httpTransportSource).not.toContain("reconcileClientProfile(");
    expect(httpTransportSource).not.toContain("setResolvedClientProfile(");
    expect(httpTransportSource).not.toContain('logClientProfileEvent("profile.detected"');
    expect(httpTransportSource).not.toContain('logClientProfileEvent("profile.reconciled"');
  });
});
