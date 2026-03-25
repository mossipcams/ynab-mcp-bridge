import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { ClientProfileId } from "./clientProfiles/types.js";

export type OAuthGrantUpstreamTokens = Pick<OAuthTokens, "token_type"> & {
  access_token?: string | undefined;
  expires_in?: number | undefined;
  refresh_token?: string | undefined;
  scope?: string | undefined;
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

export function minimizeUpstreamTokens(tokens: OAuthGrantUpstreamTokens | OAuthTokens | undefined) {
  if (!tokens) {
    return undefined;
  }

  const { access_token: _accessToken, ...remainingTokens } = tokens;
  const minimizedTokens: OAuthGrantUpstreamTokens = {
    token_type: remainingTokens.token_type,
  };

  if (remainingTokens.expires_in !== undefined) {
    minimizedTokens.expires_in = remainingTokens.expires_in;
  }

  if (remainingTokens.refresh_token !== undefined) {
    minimizedTokens.refresh_token = remainingTokens.refresh_token;
  }

  if (remainingTokens.scope !== undefined) {
    minimizedTokens.scope = remainingTokens.scope;
  }

  return minimizedTokens;
}

export function normalizeGrant(grant: OAuthGrantInput): OAuthGrant {
  const { subject: _subject, upstreamTokens, ...normalizedGrant } = grant;
  const principalId = grant.principalId ?? grant.subject;

  return {
    ...normalizedGrant,
    principalId,
    scopes: normalizeScopes(grant.scopes),
    ...(upstreamTokens ? { upstreamTokens: minimizeUpstreamTokens(upstreamTokens) } : {}),
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
