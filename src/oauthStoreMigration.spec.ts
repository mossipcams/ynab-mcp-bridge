import { describe, expect, it } from "vitest";

import { loadPersistedOAuthState } from "./grantPersistence.js";

describe("oauth store migration", () => {
  it("loads current version-2 oauth state", () => {
    const loaded = loadPersistedOAuthState({
      approvals: [{
        clientId: "client-1",
        resource: "https://mcp.example.com/mcp",
        scopes: ["profile", "openid"],
      }],
      clientProfiles: {
        "client-1": "claude",
      },
      clients: {
        "client-1": {
          client_id: "client-1",
          client_id_issued_at: 1_700_000_000,
          client_name: "Claude Web",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://claude.ai/oauth/callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
      },
      grants: {
        "grant-1": {
          clientId: "client-1",
          clientName: "Claude Web",
          codeChallenge: "challenge",
          consent: {
            challenge: "consent-1",
            expiresAt: 1_700_000_060_000,
          },
          grantId: "grant-1",
          redirectUri: "https://claude.ai/oauth/callback",
          resource: "https://mcp.example.com/mcp",
          scopes: ["profile", "openid"],
        },
      },
      version: 2,
    });

    expect(loaded.version).toBe(2);
    expect(loaded.approvals).toEqual([{
      clientId: "client-1",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
    }]);
    expect(loaded.clientProfiles).toEqual({
      "client-1": "claude",
    });
    expect(loaded.clients["client-1"]?.client_name).toBe("Claude Web");
    expect(loaded.grants["grant-1"]).toMatchObject({
      clientId: "client-1",
      consent: {
        challenge: "consent-1",
      },
      grantId: "grant-1",
      scopes: ["openid", "profile"],
    });
  });

  it("migrates legacy oauth state into the modular-monolith grant format", () => {
    const loaded = loadPersistedOAuthState({
      approvals: [],
      authorizationCodes: {
        "code-1": {
          clientId: "client-1",
          codeChallenge: "challenge",
          expiresAt: 1_700_000_060_000,
          redirectUri: "https://claude.ai/oauth/callback",
          resource: "https://mcp.example.com/mcp",
          scopes: ["profile", "openid"],
          state: "client-state",
          subject: "client-1",
          upstreamTokens: {
            access_token: "upstream-token",
            refresh_token: "upstream-refresh-token",
            token_type: "Bearer",
          },
        },
      },
      clients: {
        "client-1": {
          client_id: "client-1",
          client_id_issued_at: 1_700_000_000,
          client_name: "Claude Web",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://claude.ai/oauth/callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
      },
      pendingAuthorizations: {
        "state-1": {
          clientId: "client-1",
          codeChallenge: "challenge",
          expiresAt: 1_700_000_060_000,
          redirectUri: "https://claude.ai/oauth/callback",
          resource: "https://mcp.example.com/mcp",
          scopes: ["openid", "profile"],
          state: "client-state",
        },
      },
      pendingConsents: {
        "consent-1": {
          clientId: "client-1",
          clientName: "Claude Web",
          codeChallenge: "challenge",
          expiresAt: 1_700_000_060_000,
          redirectUri: "https://claude.ai/oauth/callback",
          resource: "https://mcp.example.com/mcp",
          scopes: ["openid", "profile"],
          state: "client-state",
        },
      },
      refreshTokens: {
        "refresh-1": {
          clientId: "client-1",
          expiresAt: 1_700_000_060_000,
          resource: "https://mcp.example.com/mcp",
          scopes: ["openid", "profile"],
          subject: "client-1",
          upstreamTokens: {
            access_token: "upstream-token",
            refresh_token: "upstream-refresh-token",
            token_type: "Bearer",
          },
        },
      },
      version: 1,
    });

    expect(loaded.version).toBe(2);
    expect(loaded.clients["client-1"]?.client_name).toBe("Claude Web");
    expect(Object.keys(loaded.grants)).toEqual(expect.arrayContaining([
      "legacy-authorization:state-1",
      "legacy-code:code-1",
      "legacy-consent:consent-1",
      "legacy-refresh:refresh-1",
    ]));
    expect(loaded.grants["legacy-consent:consent-1"]).toMatchObject({
      clientId: "client-1",
      consent: {
        challenge: "consent-1",
      },
      scopes: ["openid", "profile"],
    });
  });
});
