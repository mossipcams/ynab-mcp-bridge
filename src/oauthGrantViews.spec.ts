import { describe, expect, it } from "vitest";

import {
  toAuthorizationCodeRecord,
  toPendingAuthorizationRecord,
  toPendingConsentRecord,
  toRefreshTokenRecord,
} from "./oauthGrantViews.js";

describe("oauth grant views", () => {
  const grant = {
    authorizationCode: {
      code: "code-1",
      expiresAt: 1_700_000_100_000,
    },
    clientId: "client-1",
    clientName: "Claude Web",
    codeChallenge: "challenge",
    consent: {
      challenge: "consent-1",
      expiresAt: 1_700_000_010_000,
    },
    grantId: "grant-1",
    pendingAuthorization: {
      expiresAt: 1_700_000_020_000,
      stateId: "state-1",
    },
    principalId: "principal-1",
    redirectUri: "https://claude.ai/oauth/callback",
    resource: "https://mcp.example.com/mcp",
    scopes: ["openid", "profile"],
    state: "client-state",
    upstreamTokens: {
      access_token: "upstream-token",
      refresh_token: "upstream-refresh",
      token_type: "Bearer",
    },
    refreshToken: {
      expiresAt: 1_700_000_200_000,
      token: "refresh-1",
    },
  } as const;

  it("projects shared pending consent and pending authorization records from a grant", () => {
    expect(toPendingConsentRecord(grant)).toEqual({
      clientId: "client-1",
      clientName: "Claude Web",
      codeChallenge: "challenge",
      expiresAt: 1_700_000_010_000,
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      state: "client-state",
    });

    expect(toPendingAuthorizationRecord(grant)).toEqual({
      clientId: "client-1",
      codeChallenge: "challenge",
      expiresAt: 1_700_000_020_000,
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      state: "client-state",
    });
  });

  it("projects shared authorization-code and refresh-token records from a grant", () => {
    expect(toAuthorizationCodeRecord(grant)).toEqual({
      clientId: "client-1",
      codeChallenge: "challenge",
      expiresAt: 1_700_000_100_000,
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      state: "client-state",
      principalId: "principal-1",
      upstreamTokens: {
        access_token: "upstream-token",
        refresh_token: "upstream-refresh",
        token_type: "Bearer",
      },
    });

    expect(toRefreshTokenRecord(grant)).toEqual({
      clientId: "client-1",
      expiresAt: 1_700_000_200_000,
      principalId: "principal-1",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      upstreamTokens: {
        access_token: "upstream-token",
        refresh_token: "upstream-refresh",
        token_type: "Bearer",
      },
    });
  });

  it("returns undefined when the grant does not contain the requested active step", () => {
    expect(toPendingConsentRecord({
      grantId: "grant-2",
      clientId: "client-1",
      codeChallenge: "challenge",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
    })).toBeUndefined();
    expect(toAuthorizationCodeRecord({
      grantId: "grant-2",
      clientId: "client-1",
      codeChallenge: "challenge",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      authorizationCode: {
        code: "code-2",
        expiresAt: 1_700_000_100_000,
      },
    })).toBeUndefined();
    expect(toRefreshTokenRecord({
      grantId: "grant-2",
      clientId: "client-1",
      codeChallenge: "challenge",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      refreshToken: {
        token: "refresh-2",
        expiresAt: 1_700_000_200_000,
      },
    })).toBeUndefined();
  });
});
