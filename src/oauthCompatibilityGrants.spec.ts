import { describe, expect, it } from "vitest";

import {
  createAuthorizationCodeCompatibilityGrant,
  createPendingAuthorizationCompatibilityGrant,
  createPendingConsentCompatibilityGrant,
  createRefreshTokenCompatibilityGrant,
} from "./grantPersistence.js";

describe("oauth compatibility grants", () => {
  it("builds normalized compatibility grants for persisted authorization code and refresh token records", () => {
    expect(createAuthorizationCodeCompatibilityGrant("code-1", {
      clientId: "client-1",
      codeChallenge: "challenge",
      expiresAt: 1_700_000_100_000,
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["profile", "openid", "openid"],
      state: "client-state",
      principalId: "principal-1",
      upstreamTokens: {
        refresh_token: "upstream-refresh-token",
        token_type: "Bearer",
      },
    })).toEqual({
      authorizationCode: {
        code: "code-1",
        expiresAt: 1_700_000_100_000,
      },
      clientId: "client-1",
      codeChallenge: "challenge",
      grantId: "compat-code:code-1",
      principalId: "principal-1",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      state: "client-state",
      upstreamTokens: {
        refresh_token: "upstream-refresh-token",
        token_type: "Bearer",
      },
    });

    expect(createRefreshTokenCompatibilityGrant("refresh-1", {
      clientId: "client-1",
      expiresAt: 1_700_000_200_000,
      principalId: "principal-1",
      resource: "https://mcp.example.com/mcp",
      scopes: ["profile", "openid"],
      upstreamTokens: {
        refresh_token: "upstream-refresh-token",
        token_type: "Bearer",
      },
    })).toEqual({
      clientId: "client-1",
      codeChallenge: "",
      grantId: "compat-refresh:refresh-1",
      principalId: "principal-1",
      redirectUri: "",
      refreshToken: {
        expiresAt: 1_700_000_200_000,
        token: "refresh-1",
      },
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      upstreamTokens: {
        refresh_token: "upstream-refresh-token",
        token_type: "Bearer",
      },
    });
  });

  it("builds normalized compatibility grants for persisted pending authorization and consent records", () => {
    expect(createPendingAuthorizationCompatibilityGrant("state-1", {
      clientId: "client-1",
      codeChallenge: "challenge",
      expiresAt: 1_700_000_010_000,
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["profile", "openid", "profile"],
      state: "client-state",
    })).toEqual({
      clientId: "client-1",
      codeChallenge: "challenge",
      grantId: "compat-authorization:state-1",
      pendingAuthorization: {
        expiresAt: 1_700_000_010_000,
        stateId: "state-1",
      },
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      state: "client-state",
    });

    expect(createPendingConsentCompatibilityGrant("consent-1", {
      clientId: "client-1",
      clientName: "Claude Web",
      codeChallenge: "challenge",
      expiresAt: 1_700_000_020_000,
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      state: "client-state",
    })).toEqual({
      clientId: "client-1",
      clientName: "Claude Web",
      codeChallenge: "challenge",
      consent: {
        challenge: "consent-1",
        expiresAt: 1_700_000_020_000,
      },
      grantId: "compat-consent:consent-1",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      state: "client-state",
    });
  });
});
