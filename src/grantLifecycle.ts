/**
 * Owns: OAuth client validation and all grant state transitions across consent, upstream authorization, authorization-code exchange, and refresh-token exchange.
 * Inputs/dependencies: clock/id/token-exchange/mint dependencies plus the persistence contract.
 * Outputs/contracts: createOAuthCore(...), PendingAuthorization, and PendingConsent consumed by the OAuth runtime.
 */
import {
  InvalidGrantError,
  InvalidRequestError,
  InvalidScopeError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

import { getEffectiveOAuthScopes } from "./config.js";
import type { OAuthGrant } from "./oauthGrant.js";
import { parseClientMetadata } from "./oauthSchemas.js";

export type PendingAuthorization = {
  clientId: string;
  codeChallenge: string;
  expiresAt: number;
  redirectUri: string;
  resource: string;
  scopes: string[];
  state?: string | undefined;
};

export type PendingConsent = PendingAuthorization & {
  clientName?: string | undefined;
};

type OAuthCoreStore = {
  approveClient: (record: { clientId: string; redirectUri: string; resource: string; scopes: string[] }) => void;
  deleteGrant: (grantId: string) => void;
  getAuthorizationCodeGrant: (code: string) => OAuthGrant | undefined;
  getClient: (clientId: string) => OAuthClientInformationFull | undefined;
  getPendingAuthorizationGrant: (stateId: string) => OAuthGrant | undefined;
  getPendingConsentGrant: (consentId: string) => OAuthGrant | undefined;
  getRefreshTokenGrant: (refreshToken: string) => OAuthGrant | undefined;
  isClientApproved: (record: { clientId: string; redirectUri: string; resource: string; scopes: string[] }) => boolean;
  saveClient: (client: OAuthClientInformationFull) => void;
  saveGrant: (grant: OAuthGrant) => void;
};

type OAuthCoreConfig = {
  callbackUrl: string;
  defaultResource: string;
  defaultScopes: string[];
  skipLocalConsent?: boolean;
};

type OAuthCoreDependencies = {
  createClientId?: () => string;
  createId: () => string;
  createUpstreamAuthorizationUrl: (record: {
    resource: string;
    scopes: string[];
    upstreamState: string;
  }) => string;
  exchangeUpstreamAuthorizationCode: (code: string) => Promise<OAuthTokens>;
  exchangeUpstreamRefreshToken: (refreshToken: string) => Promise<OAuthTokens>;
  mintAccessToken: (record: {
    clientId: string;
    expiresInSeconds: number;
    principalId: string;
    resource: string;
    scopes: string[];
  }) => Promise<string>;
  now: () => number;
};

type OAuthCoreOptions = {
  config: OAuthCoreConfig;
  dependencies: OAuthCoreDependencies;
  store: OAuthCoreStore;
};

type AuthorizationRequest = {
  codeChallenge: string;
  redirectUri: string;
  resource?: URL;
  scopes?: string[];
  state?: string;
};

type CallbackInput = {
  code?: string | undefined;
  error?: string | undefined;
  errorDescription?: string | undefined;
  upstreamState: string;
};

function clampExpiresIn(expiresIn: number | undefined) {
  return Math.max(60, Math.min(expiresIn ?? 3600, 3600));
}

function createErrorRedirect(redirectUri: string, params: Record<string, string | undefined>) {
  const url = new URL(redirectUri);

  for (const [name, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(name, value);
    }
  }

  return url.href;
}

function isExpired(expiresAt: number | undefined, now: number) {
  return expiresAt !== undefined && expiresAt <= now;
}

function assertRegisteredRedirectUri(client: OAuthClientInformationFull, redirectUri: string) {
  if (!client.redirect_uris.includes(redirectUri)) {
    throw new InvalidRequestError("redirect_uri does not match a registered client redirect URI.");
  }
}

function toPendingConsent(grant: OAuthGrant): PendingConsent {
  if (!grant.consent) {
    throw new InvalidRequestError("Unknown consent challenge.");
  }

  return {
    clientId: grant.clientId,
    clientName: grant.clientName,
    codeChallenge: grant.codeChallenge,
    expiresAt: grant.consent.expiresAt,
    redirectUri: grant.redirectUri,
    resource: grant.resource,
    scopes: grant.scopes,
    state: grant.state,
  };
}

export function createOAuthCore({ config, dependencies, store }: OAuthCoreOptions) {
  async function registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
  ) {
    const validatedClient = parseClientMetadata(client);

    const registeredClient: OAuthClientInformationFull = {
      ...validatedClient,
      client_id: dependencies.createClientId?.() ?? dependencies.createId(),
      client_id_issued_at: Math.floor(dependencies.now() / 1000),
    };

    store.saveClient(registeredClient);
    return registeredClient;
  }

  async function startAuthorization(client: OAuthClientInformationFull, params: AuthorizationRequest) {
    assertRegisteredRedirectUri(client, params.redirectUri);

    const scopes = getEffectiveOAuthScopes(
      params.scopes && params.scopes.length > 0 ? params.scopes : config.defaultScopes,
    );
    const resource = params.resource?.href ?? config.defaultResource;

    if (config.skipLocalConsent || store.isClientApproved({
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      resource,
      scopes,
    })) {
      const upstreamState = dependencies.createId();
      store.saveGrant({
        clientId: client.client_id,
        codeChallenge: params.codeChallenge,
        grantId: upstreamState,
        pendingAuthorization: {
          expiresAt: dependencies.now() + 10 * 60 * 1000,
          stateId: upstreamState,
        },
        redirectUri: params.redirectUri,
        resource,
        scopes,
        state: params.state,
      });

      return {
        type: "redirect" as const,
        location: dependencies.createUpstreamAuthorizationUrl({
          resource,
          scopes,
          upstreamState,
        }),
      };
    }

    const consentChallenge = dependencies.createId();
    const grant: OAuthGrant = {
      clientId: client.client_id,
      clientName: client.client_name,
      codeChallenge: params.codeChallenge,
      consent: {
        challenge: consentChallenge,
        expiresAt: dependencies.now() + 10 * 60 * 1000,
      },
      grantId: consentChallenge,
      redirectUri: params.redirectUri,
      resource,
      scopes,
      state: params.state,
    };

    store.saveGrant(grant);

    return {
      type: "consent" as const,
      consentChallenge,
      pending: toPendingConsent(grant),
    };
  }

  async function approveConsent(consentChallenge: string, action: string) {
    const grant = store.getPendingConsentGrant(consentChallenge);

    if (!grant || isExpired(grant.consent?.expiresAt, dependencies.now())) {
      if (grant) {
        store.deleteGrant(grant.grantId);
      }
      throw new InvalidRequestError("Unknown consent challenge.");
    }

    if (action !== "approve") {
      store.deleteGrant(grant.grantId);
      return {
        type: "redirect" as const,
        location: createErrorRedirect(grant.redirectUri, {
          error: "access_denied",
          error_description: "The user denied access to the MCP client.",
          state: grant.state,
        }),
      };
    }

    store.approveClient({
      clientId: grant.clientId,
      redirectUri: grant.redirectUri,
      resource: grant.resource,
      scopes: grant.scopes,
    });

    const upstreamState = dependencies.createId();
    store.saveGrant({
      ...grant,
      consent: undefined,
      pendingAuthorization: {
        expiresAt: dependencies.now() + 10 * 60 * 1000,
        stateId: upstreamState,
      },
    });

    return {
      type: "redirect" as const,
      location: dependencies.createUpstreamAuthorizationUrl({
        resource: grant.resource,
        scopes: grant.scopes,
        upstreamState,
      }),
    };
  }

  async function handleCallback(params: CallbackInput) {
    const grant = store.getPendingAuthorizationGrant(params.upstreamState);

    if (!grant || isExpired(grant.pendingAuthorization?.expiresAt, dependencies.now())) {
      if (grant) {
        store.deleteGrant(grant.grantId);
      }
      throw new InvalidRequestError("Unknown upstream OAuth state.");
    }

    if (params.error) {
      store.deleteGrant(grant.grantId);
      return {
        type: "redirect" as const,
        location: createErrorRedirect(grant.redirectUri, {
          error: params.error,
          error_description: params.errorDescription,
          state: grant.state,
        }),
      };
    }

    if (!params.code) {
      throw new InvalidRequestError("Missing upstream OAuth code.");
    }

    const authorizationCode = dependencies.createId();
    const upstreamTokens = await dependencies.exchangeUpstreamAuthorizationCode(params.code);

    store.saveGrant({
      ...grant,
      authorizationCode: {
        code: authorizationCode,
        expiresAt: dependencies.now() + 5 * 60 * 1000,
      },
      pendingAuthorization: undefined,
      principalId: grant.clientId,
      upstreamTokens,
    });

    const redirectUrl = new URL(grant.redirectUri);
    redirectUrl.searchParams.set("code", authorizationCode);

    if (grant.state) {
      redirectUrl.searchParams.set("state", grant.state);
    }

    return {
      type: "redirect" as const,
      location: redirectUrl.href,
    };
  }

  async function getAuthorizationCodeChallenge(client: OAuthClientInformationFull, authorizationCode: string) {
    const grant = store.getAuthorizationCodeGrant(authorizationCode);

    if (!grant || !grant.authorizationCode || grant.clientId !== client.client_id) {
      throw new InvalidGrantError("Unknown authorization code.");
    }

    if (isExpired(grant.authorizationCode.expiresAt, dependencies.now())) {
      store.deleteGrant(grant.grantId);
      throw new InvalidGrantError("Authorization code has expired.");
    }

    return grant.codeChallenge;
  }

  async function exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    redirectUri: string | undefined,
    resource: URL | undefined,
  ) {
    const grant = store.getAuthorizationCodeGrant(authorizationCode);

    if (!grant || !grant.authorizationCode || grant.clientId !== client.client_id) {
      throw new InvalidGrantError("Unknown authorization code.");
    }

    if (isExpired(grant.authorizationCode.expiresAt, dependencies.now())) {
      store.deleteGrant(grant.grantId);
      throw new InvalidGrantError("Authorization code has expired.");
    }

    if (redirectUri && redirectUri !== grant.redirectUri) {
      throw new InvalidGrantError("redirect_uri does not match the authorization request.");
    }

    if (resource?.href && resource.href !== grant.resource) {
      throw new InvalidGrantError("resource does not match the authorization request.");
    }

    if (!grant.principalId || !grant.upstreamTokens) {
      store.deleteGrant(grant.grantId);
      throw new InvalidGrantError("Authorization code is missing grant context.");
    }

    const expiresInSeconds = clampExpiresIn(grant.upstreamTokens.expires_in);
    const accessToken = await dependencies.mintAccessToken({
      clientId: grant.clientId,
      expiresInSeconds,
      principalId: grant.principalId,
      resource: grant.resource,
      scopes: grant.scopes,
    });
    const refreshToken = dependencies.createId();

    store.saveGrant({
      ...grant,
      authorizationCode: undefined,
      refreshToken: {
        expiresAt: dependencies.now() + 30 * 24 * 60 * 60 * 1000,
        token: refreshToken,
      },
    });

    return {
      access_token: accessToken,
      expires_in: expiresInSeconds,
      refresh_token: refreshToken,
      scope: grant.scopes.join(" "),
      token_type: "Bearer" as const,
    };
  }

  async function exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes: string[] | undefined,
    resource: URL | undefined,
  ) {
    const grant = store.getRefreshTokenGrant(refreshToken);

    if (!grant || !grant.refreshToken || grant.clientId !== client.client_id) {
      throw new InvalidGrantError("Unknown refresh token.");
    }

    if (isExpired(grant.refreshToken.expiresAt, dependencies.now())) {
      store.deleteGrant(grant.grantId);
      throw new InvalidGrantError("Refresh token has expired.");
    }

    const grantedScopes = scopes && scopes.length > 0 ? scopes : grant.scopes;

    if (!grantedScopes.every((scope) => grant.scopes.includes(scope))) {
      throw new InvalidScopeError("Requested scope exceeds the original grant.");
    }

    if (resource?.href && resource.href !== grant.resource) {
      throw new InvalidGrantError("resource does not match the refresh token.");
    }

    if (!grant.principalId) {
      store.deleteGrant(grant.grantId);
      throw new InvalidGrantError("Refresh token is missing grant context.");
    }

    const upstreamRefreshToken = grant.upstreamTokens?.refresh_token;

    if (!upstreamRefreshToken) {
      store.deleteGrant(grant.grantId);
      throw new InvalidGrantError("Refresh token is missing upstream credentials.");
    }

    const refreshedUpstreamTokens = await dependencies.exchangeUpstreamRefreshToken(upstreamRefreshToken);
    const nextUpstreamTokens: OAuthTokens = {
      ...grant.upstreamTokens,
      ...refreshedUpstreamTokens,
      refresh_token: refreshedUpstreamTokens.refresh_token ?? upstreamRefreshToken,
    };

    const expiresInSeconds = clampExpiresIn(nextUpstreamTokens.expires_in);
    const accessToken = await dependencies.mintAccessToken({
      clientId: grant.clientId,
      expiresInSeconds,
      principalId: grant.principalId,
      resource: grant.resource,
      scopes: grantedScopes,
    });
    const nextRefreshToken = dependencies.createId();

    store.saveGrant({
      ...grant,
      refreshToken: {
        expiresAt: dependencies.now() + 30 * 24 * 60 * 60 * 1000,
        token: nextRefreshToken,
      },
      upstreamTokens: nextUpstreamTokens,
    });

    return {
      access_token: accessToken,
      expires_in: expiresInSeconds,
      refresh_token: nextRefreshToken,
      scope: grantedScopes.join(" "),
      token_type: "Bearer" as const,
    };
  }

  return {
    approveConsent,
    exchangeAuthorizationCode,
    exchangeRefreshToken,
    getAuthorizationCodeChallenge,
    getClient: store.getClient,
    handleCallback,
    registerClient,
    startAuthorization,
  };
}
