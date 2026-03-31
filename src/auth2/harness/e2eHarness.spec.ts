import { describe, expect, it } from "vitest";

import { runClientFlowWithFakeProvider } from "./e2eHarness.js";

describe("auth2 e2e harness", () => {
  it("completes the same flow for two config-only clients", async () => {
    const clientA = await runClientFlowWithFakeProvider({
      clientId: "client-a",
      redirectUri: "https://claude.ai/oauth/callback",
      scopes: ["openid", "profile"],
    });
    const clientB = await runClientFlowWithFakeProvider({
      clientId: "client-b",
      redirectUri: "https://chatgpt.com/oauth/callback",
      scopes: ["openid"],
    });

    expect(clientA).toMatchObject({
      callbackRedirect: "https://claude.ai/oauth/callback?code=generated-3&state=client-a-state",
      refreshScope: "openid",
      tokenScope: "openid profile",
    });
    expect(clientB).toMatchObject({
      callbackRedirect: "https://chatgpt.com/oauth/callback?code=generated-3&state=client-b-state",
      refreshScope: "openid",
      tokenScope: "openid",
    });
    expect(clientA.providerCalls).toEqual({
      authorizationCodeExchanges: ["upstream-code-123"],
      refreshTokenExchanges: ["provider-refresh-token"],
    });
    expect(clientB.providerCalls).toEqual({
      authorizationCodeExchanges: ["upstream-code-123"],
      refreshTokenExchanges: ["provider-refresh-token"],
    });
  });
});
