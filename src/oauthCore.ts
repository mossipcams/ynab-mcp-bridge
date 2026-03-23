import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidRequestError,
  InvalidScopeError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

import { getEffectiveOAuthScopes } from "./config.js";
import { logAppEvent } from "./logger.js";
import type { OAuthGrant } from "./oauthGrant.js";
import { parseAuthorizationRequest, parseClientMetadata } from "./oauthSchemas.js";
import { getRequestLogFields } from "./requestContext.js";

export type PendingAuthorization = {
  clientId: string;
  codeChallenge: string;
  expiresAt: number;
  redirectUri: string;
  resource: string;
  scopes: string[];
  state?: string;
};

export type PendingConsent = PendingAuthorization & {
  clientName?: string;
};

type OAuthCoreStore = {
  approveClient: (record: { clientId: string; resource: string; scopes: string[] }) => void;
  deleteGrant: (grantId: string) => void;
  getAuthorizationCodeGrant: (code: string) => OAuthGrant | undefined;
  getClient: (clientId: string) => OAuthClientInformationFull | undefined;
  getPendingAuthorizationGrant: (stateId: string) => OAuthGrant | undefined;
  getPendingConsentGrant: (consentId: string) => OAuthGrant | undefined;
  getRefreshTokenGrant: (refreshToken: string) => OAuthGrant | undefined;
  isClientApproved: (record: { clientId: string; resource: string; scopes: string[] }) => boolean;
  saveClient: (client: OAuthClientInformationFull) => void;
  saveGrant: (grant: OAuthGrant) => void;
};

type OAuthCoreConfig = {
  callbackUrl: string;
  defaultResource: string;
  defaultScopes: string[];
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
  code?: string;
  error?: string;
  errorDescription?: string;
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

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const upstreamError = "upstreamError" in error && typeof error.upstreamError === "string"
      ? error.upstreamError
      : undefined;
    const upstreamErrorDescription = "upstreamErrorDescription" in error &&
      typeof error.upstreamErrorDescription === "string"
      ? error.upstreamErrorDescription
      : undefined;
    const upstreamErrorFields = "upstreamErrorFields" in error &&
      Array.isArray(error.upstreamErrorFields) &&
      error.upstreamErrorFields.every((field) => typeof field === "string")
      ? error.upstreamErrorFields
      : undefined;

    return {
      errorMessage: error.message,
      errorName: error.name,
      upstreamError,
      upstreamErrorDescription,
      upstreamErrorFields,
    };
  }

  return {
    errorMessage: String(error),
    errorName: "UnknownError",
  };
}

function validateRegisteredRedirectUris(redirectUris: string[] | undefined) {
  for (const redirectUri of redirectUris ?? []) {
    let parsedRedirectUri: URL;

    try {
      parsedRedirectUri = new URL(redirectUri);
    } catch {
      throw new InvalidClientMetadataError(`redirect_uris must contain valid absolute URLs: ${redirectUri}`);
    }

    if (parsedRedirectUri.protocol !== "https:") {
      throw new InvalidClientMetadataError(`redirect_uris must use https: ${redirectUri}`);
    }
  }
}

function validateClientMetadata(client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">) {
  validateRegisteredRedirectUris(client.redirect_uris);

  const unsupportedFields = [
    "client_uri",
    "contacts",
    "jwks",
    "jwks_uri",
    "logo_uri",
    "policy_uri",
    "software_id",
    "software_statement",
    "software_version",
    "tos_uri",
  ] as const;

  for (const field of unsupportedFields) {
    if (field in client && client[field] !== undefined) {
      throw new InvalidClientMetadataError(`${field} is not supported by this bridge.`);
    }
  }

  const allowedGrantTypes = new Set(["authorization_code", "refresh_token"]);
  const invalidGrantType = (client.grant_types ?? ["authorization_code"])
    .find((grantType) => !allowedGrantTypes.has(grantType));

  if (invalidGrantType) {
    throw new InvalidClientMetadataError(`Unsupported grant type: ${invalidGrantType}`);
  }

  const allowedResponseTypes = new Set(["code"]);
  const responseTypes = client.response_types ?? ["code"];
  const invalidResponseType = responseTypes.find((responseType) => !allowedResponseTypes.has(responseType));

  if (invalidResponseType) {
    throw new InvalidClientMetadataError(`Unsupported response type: ${invalidResponseType}`);
  }

  if (responseTypes.length !== 1 || responseTypes[0] !== "code") {
    throw new InvalidClientMetadataError("response_types must be exactly [\"code\"].");
  }

  const allowedAuthMethods = new Set(["client_secret_post", "none"]);
  const tokenEndpointAuthMethod = client.token_endpoint_auth_method ?? "none";

  if (!allowedAuthMethods.has(tokenEndpointAuthMethod)) {
    throw new InvalidClientMetadataError(
      `Unsupported token endpoint auth method: ${tokenEndpointAuthMethod}`,
    );
  }
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
    codeChallenge: grant.codeChallenge,
    expiresAt: grant.consent.expiresAt,
    redirectUri: grant.redirectUri,
    resource: grant.resource,
    scopes: grant.scopes,
    ...(grant.clientName ? { clientName: grant.clientName } : {}),
    ...(grant.state ? { state: grant.state } : {}),
  };
}

export function createOAuthCore({ config, dependencies, store }: OAuthCoreOptions) {
  async function registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
  ) {
    const parsedClient = parseClientMetadata(client);
    validateClientMetadata(parsedClient);

    const registeredClient: OAuthClientInformationFull = {
      ...parsedClient,
      client_id: dependencies.createClientId?.() ?? dependencies.createId(),
      client_id_issued_at: Math.floor(dependencies.now() / 1000),
    };

    store.saveClient(registeredClient);
    return registeredClient;
  }

  async function startAuthorization(client: OAuthClientInformationFull, params: AuthorizationRequest) {
    const parsedParams = parseAuthorizationRequest(params);
    assertRegisteredRedirectUri(client, parsedParams.redirectUri);

    const scopes = getEffectiveOAuthScopes(
      parsedParams.scopes && parsedParams.scopes.length > 0 ? parsedParams.scopes : config.defaultScopes,
    );
    const resource = parsedParams.resource?.href ?? config.defaultResource;

    if (store.isClientApproved({
      clientId: client.client_id,
      resource,
      scopes,
    })) {
      const upstreamState = dependencies.createId();
      store.saveGrant({
        clientId: client.client_id,
        codeChallenge: parsedParams.codeChallenge,
        grantId: upstreamState,
        pendingAuthorization: {
          expiresAt: dependencies.now() + 10 * 60 * 1000,
          stateId: upstreamState,
        },
        redirectUri: parsedParams.redirectUri,
        resource,
        scopes,
        state: parsedParams.state,
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
      codeChallenge: parsedParams.codeChallenge,
      consent: {
        challenge: consentChallenge,
        expiresAt: dependencies.now() + 10 * 60 * 1000,
      },
      grantId: consentChallenge,
      redirectUri: parsedParams.redirectUri,
      resource,
      scopes,
      state: parsedParams.state,
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

    store.deleteGrant(grant.grantId);

    if (action !== "approve") {
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

    store.deleteGrant(grant.grantId);

    if (params.error) {
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

    store.deleteGrant(grant.grantId);

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

    let refreshedUpstreamTokens: OAuthTokens;

    try {
      refreshedUpstreamTokens = await dependencies.exchangeUpstreamRefreshToken(
        grant.upstreamTokens?.refresh_token ?? "",
      );
    } catch (error) {
      logAppEvent("oauth", "token.refresh.failed", {
        ...getRequestLogFields(),
        clientId: client.client_id,
        grantType: "refresh_token",
        hasRefreshToken: typeof refreshToken === "string" && refreshToken.length > 0,
        hasResource: Boolean(resource?.href),
        scopeCount: scopes?.length ?? 0,
        ...getErrorDetails(error),
      });
      throw error;
    }

    const nextUpstreamTokens: OAuthTokens = {
      ...grant.upstreamTokens,
      ...refreshedUpstreamTokens,
      refresh_token: refreshedUpstreamTokens.refresh_token ?? grant.upstreamTokens?.refresh_token,
    };

    if (!grant.principalId) {
      store.deleteGrant(grant.grantId);
      throw new InvalidGrantError("Refresh token is missing grant context.");
    }

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
