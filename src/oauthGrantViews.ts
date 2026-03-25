import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

import type { OAuthGrant } from "./oauthGrant.js";

export type PendingAuthorizationRecord = {
  clientId: string;
  codeChallenge: string;
  expiresAt: number;
  redirectUri: string;
  resource: string;
  scopes: string[];
  state?: string | undefined;
};

export type PendingConsentRecord = PendingAuthorizationRecord & {
  clientName?: string | undefined;
};

export type PendingAuthorization = PendingAuthorizationRecord;
export type PendingConsent = PendingConsentRecord;

export type AuthorizationCodeRecord = PendingAuthorizationRecord & {
  principalId: string;
  upstreamTokens: OAuthTokens;
};

export type RefreshTokenRecord = {
  clientId: string;
  expiresAt: number;
  principalId: string;
  resource: string;
  scopes: string[];
  upstreamTokens: OAuthTokens;
};

function toBasePendingRecord(
  grant: OAuthGrant,
  expiresAt: number,
): PendingAuthorizationRecord {
  return {
    clientId: grant.clientId,
    codeChallenge: grant.codeChallenge,
    expiresAt,
    redirectUri: grant.redirectUri,
    resource: grant.resource,
    scopes: grant.scopes,
    state: grant.state,
  };
}

export function toPendingConsentRecord(grant: OAuthGrant): PendingConsentRecord | undefined {
  if (!grant.consent) {
    return undefined;
  }

  return {
    ...toBasePendingRecord(grant, grant.consent.expiresAt),
    clientName: grant.clientName,
  };
}

export function toPendingAuthorizationRecord(grant: OAuthGrant): PendingAuthorizationRecord | undefined {
  if (!grant.pendingAuthorization) {
    return undefined;
  }

  return toBasePendingRecord(grant, grant.pendingAuthorization.expiresAt);
}

export function toAuthorizationCodeRecord(grant: OAuthGrant): AuthorizationCodeRecord | undefined {
  if (!grant.authorizationCode || !grant.principalId || !grant.upstreamTokens) {
    return undefined;
  }

  return {
    ...toBasePendingRecord(grant, grant.authorizationCode.expiresAt),
    principalId: grant.principalId,
    upstreamTokens: grant.upstreamTokens,
  };
}

export function toRefreshTokenRecord(grant: OAuthGrant): RefreshTokenRecord | undefined {
  if (!grant.refreshToken || !grant.principalId || !grant.upstreamTokens) {
    return undefined;
  }

  return {
    clientId: grant.clientId,
    expiresAt: grant.refreshToken.expiresAt,
    principalId: grant.principalId,
    resource: grant.resource,
    scopes: grant.scopes,
    upstreamTokens: grant.upstreamTokens,
  };
}
