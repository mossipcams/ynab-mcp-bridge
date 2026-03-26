import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

import type { ClientProfileId } from "./clientProfiles/types.js";

export type OAuthGrant = {
  authorizationCode?: {
    code: string;
    expiresAt: number;
  };
  clientId: string;
  clientName?: string;
  compatibilityProfileId?: ClientProfileId;
  codeChallenge: string;
  consent?: {
    challenge: string;
    expiresAt: number;
  };
  grantId: string;
  pendingAuthorization?: {
    expiresAt: number;
    stateId: string;
  };
  redirectUri: string;
  refreshToken?: {
    expiresAt: number;
    token: string;
  };
  resource: string;
  scopes: string[];
  state?: string;
  principalId?: string;
  upstreamTokens?: OAuthTokens;
};

export type OAuthGrantInput = OAuthGrant & {
  subject?: string;
};

export function normalizeScopes(scopes: string[]) {
  return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))].sort();
}

export function normalizeGrant(grant: OAuthGrantInput): OAuthGrant {
  const { subject: _subject, ...normalizedGrant } = grant;
  const principalId = grant.principalId ?? grant.subject;

  return {
    ...normalizedGrant,
    principalId,
    scopes: normalizeScopes(grant.scopes),
  };
}

export function getGrantExpiry(grant: OAuthGrant) {
  return grant.consent?.expiresAt ??
    grant.pendingAuthorization?.expiresAt ??
    grant.authorizationCode?.expiresAt ??
    grant.refreshToken?.expiresAt;
}

export function hasActiveGrantStep(grant: OAuthGrant) {
  return grant.consent !== undefined ||
    grant.pendingAuthorization !== undefined ||
    grant.authorizationCode !== undefined ||
    grant.refreshToken !== undefined;
}
