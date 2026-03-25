import { normalizeGrant, type OAuthGrant } from "./oauthGrant.js";
import type {
  AuthorizationCodeRecord,
  PendingAuthorizationRecord,
  PendingConsentRecord,
  RefreshTokenRecord,
} from "./oauthGrantViews.js";

export function createAuthorizationCodeCompatibilityGrant(
  code: string,
  record: AuthorizationCodeRecord,
): OAuthGrant {
  return normalizeGrant({
    authorizationCode: {
      code,
      expiresAt: record.expiresAt,
    },
    clientId: record.clientId,
    codeChallenge: record.codeChallenge,
    grantId: `compat-code:${code}`,
    redirectUri: record.redirectUri,
    resource: record.resource,
    scopes: record.scopes,
    state: record.state,
    principalId: record.principalId,
    upstreamTokens: record.upstreamTokens,
  });
}

export function createPendingAuthorizationCompatibilityGrant(
  stateId: string,
  record: PendingAuthorizationRecord,
): OAuthGrant {
  return normalizeGrant({
    clientId: record.clientId,
    codeChallenge: record.codeChallenge,
    grantId: `compat-authorization:${stateId}`,
    pendingAuthorization: {
      expiresAt: record.expiresAt,
      stateId,
    },
    redirectUri: record.redirectUri,
    resource: record.resource,
    scopes: record.scopes,
    state: record.state,
  });
}

export function createPendingConsentCompatibilityGrant(
  consentId: string,
  record: PendingConsentRecord,
): OAuthGrant {
  return normalizeGrant({
    clientId: record.clientId,
    clientName: record.clientName,
    codeChallenge: record.codeChallenge,
    consent: {
      challenge: consentId,
      expiresAt: record.expiresAt,
    },
    grantId: `compat-consent:${consentId}`,
    redirectUri: record.redirectUri,
    resource: record.resource,
    scopes: record.scopes,
    state: record.state,
  });
}

export function createRefreshTokenCompatibilityGrant(
  refreshToken: string,
  record: RefreshTokenRecord,
): OAuthGrant {
  return normalizeGrant({
    clientId: record.clientId,
    codeChallenge: "",
    grantId: `compat-refresh:${refreshToken}`,
    redirectUri: "",
    refreshToken: {
      expiresAt: record.expiresAt,
      token: refreshToken,
    },
    resource: record.resource,
    scopes: record.scopes,
    principalId: record.principalId,
    upstreamTokens: record.upstreamTokens,
  });
}
