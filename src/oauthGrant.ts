import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

export type OAuthGrant = {
  authorizationCode?: {
    code: string;
    expiresAt: number;
  };
  clientId: string;
  clientName?: string;
  codeChallenge: string;
  consent?: {
    challenge: string;
    expiresAt: number;
  };
  consentApprovalReplay?: {
    challenge: string;
    expiresAt: number;
    location: string;
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
  subject?: string;
  upstreamTokens?: OAuthTokens;
};

export function normalizeScopes(scopes: string[]) {
  return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))].sort();
}

export function normalizeGrant(grant: OAuthGrant): OAuthGrant {
  return {
    ...grant,
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
