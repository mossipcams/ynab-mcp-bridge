import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

import type { ClientProfileId } from "./clientProfiles/types.js";

export type OAuthGrantUpstreamTokens = Omit<OAuthTokens, "access_token"> & {
  access_token?: string;
};
export type OAuthGrant = {
  authorizationCode?: {
    code: string;
    expiresAt: number;
  } | undefined;
  clientId: string;
  clientName?: string | undefined;
  compatibilityProfileId?: ClientProfileId | undefined;
  codeChallenge: string;
  consent?: {
    challenge: string;
    expiresAt: number;
  } | undefined;
  grantId: string;
  pendingAuthorization?: {
    expiresAt: number;
    stateId: string;
  } | undefined;
  redirectUri: string;
  refreshToken?: {
    expiresAt: number;
    token: string;
  } | undefined;
  resource: string;
  scopes: string[];
  state?: string | undefined;
  principalId?: string | undefined;
  upstreamTokens?: OAuthGrantUpstreamTokens | undefined;
};

export type OAuthGrantInput = OAuthGrant & {
  subject?: string | undefined;
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
