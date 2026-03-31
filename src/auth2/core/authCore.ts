import type { AuthConfig } from "../config/schema.js";
import { assertExactRedirectUri, findClientConfig } from "./redirectUri.js";
import { createStateManager } from "./state.js";
import type { AuthStore } from "../store/authStore.js";
import { verifyPkceCodeVerifier } from "./pkce.js";
import { fingerprintAuthValue, logAuthEvent } from "../logging/authEvents.js";

type AuthorizationRequest = {
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  responseType: string;
  scopes?: string[];
  state?: string;
};

type CreateAuthCoreOptions = {
  config: AuthConfig;
  createId: () => string;
  now: () => number;
  provider: {
    buildAuthorizationUrl: (input: {
      callbackUri: string;
      clientId: string;
      codeChallenge: string;
      codeChallengeMethod: "S256";
      scopes: string[];
      state: string;
    }) => string;
    exchangeAuthorizationCode?: (input: {
      callbackUri: string;
      code: string;
      codeVerifier: string;
    }) => Promise<Record<string, unknown>>;
    exchangeRefreshToken?: (input: {
      refreshToken: string;
    }) => Promise<Record<string, unknown>>;
  };
  store: AuthStore;
  upstreamPkce: {
    createPair: () => {
      challenge: string;
      method: "S256";
      verifier: string;
    };
  };
};

function getCallbackUri(config: AuthConfig) {
  return new URL(config.callbackPath, config.publicBaseUrl).href;
}

function createRedirectUri(
  redirectUri: string,
  params: Record<string, string | undefined>,
) {
  const url = new URL(redirectUri);

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.length > 0) {
      url.searchParams.set(key, value);
    }
  }

  return url.href;
}

function resolveScopes(requestedScopes: string[] | undefined, allowedScopes: string[]) {
  const scopes = requestedScopes && requestedScopes.length > 0 ? requestedScopes : allowedScopes;

  for (const scope of scopes) {
    if (!allowedScopes.includes(scope)) {
      throw new Error(`Requested scope is not allowed for this client: ${scope}`);
    }
  }

  return scopes;
}

export function createAuthCore(options: CreateAuthCoreOptions) {
  const stateManager = createStateManager({
    createId: options.createId,
    now: options.now,
    store: options.store,
    ttlMs: 10 * 60 * 1000,
  });

  function startAuthorization(request: AuthorizationRequest) {
    logAuthEvent("auth.authorize.started", {
      clientId: request.clientId,
      hasState: typeof request.state === "string" && request.state.length > 0,
      redirectUriFingerprint: fingerprintAuthValue(request.redirectUri),
      requestedScopeCount: request.scopes?.length ?? 0,
      responseType: request.responseType,
    });

    if (request.responseType !== "code") {
      throw new Error("response_type must be code.");
    }

    if (request.codeChallengeMethod !== "S256") {
      throw new Error("code_challenge_method must be S256.");
    }

    const client = findClientConfig(options.config, options.store, request.clientId);
    assertExactRedirectUri(client, request.redirectUri);

    const transactionId = options.createId();
    const upstreamPkce = options.upstreamPkce.createPair();
    const scopes = resolveScopes(request.scopes, client.scopes);
    const state = stateManager.issueState(transactionId);

    options.store.saveTransaction({
      clientId: client.clientId,
      createdAt: options.now(),
      downstreamCodeChallenge: request.codeChallenge,
      downstreamCodeChallengeMethod: "S256",
      ...(request.state ? { downstreamState: request.state } : {}),
      expiresAt: options.now() + 10 * 60 * 1000,
      providerId: client.providerId,
      redirectUri: client.redirectUri,
      scopes,
      transactionId,
      upstreamCodeVerifier: upstreamPkce.verifier,
      upstreamState: state.stateId,
    });

    logAuthEvent("auth.authorize.redirect_ready", {
      clientId: client.clientId,
      redirectUriFingerprint: fingerprintAuthValue(client.redirectUri),
      requestedScopeCount: scopes.length,
      transactionId,
      upstreamStateFingerprint: fingerprintAuthValue(state.stateId),
    });

    return {
      redirectTo: options.provider.buildAuthorizationUrl({
        callbackUri: getCallbackUri(options.config),
        clientId: options.config.provider.clientId,
        codeChallenge: upstreamPkce.challenge,
        codeChallengeMethod: upstreamPkce.method,
        scopes,
        state: state.stateId,
      }),
      transactionId,
    };
  }

  async function handleCallback(input: {
    code?: string;
    error?: string;
    errorDescription?: string;
    state?: string;
  }) {
    logAuthEvent("auth.callback.received", {
      hasCode: typeof input.code === "string" && input.code.length > 0,
      hasError: typeof input.error === "string" && input.error.length > 0,
      hasState: typeof input.state === "string" && input.state.length > 0,
      ...(input.state ? { upstreamStateFingerprint: fingerprintAuthValue(input.state) } : {}),
    });

    if (!input.state) {
      throw new Error("Missing upstream OAuth state.");
    }

    const consumedState = stateManager.consumeState(input.state);
    const transaction = options.store.getTransaction(consumedState.transactionId);

    if (!transaction) {
      throw new Error(`Unknown OAuth transaction: ${consumedState.transactionId}`);
    }

    if (input.error) {
      logAuthEvent("auth.callback.completed", {
        outcome: "error_redirect",
        transactionId: transaction.transactionId,
        upstreamStateFingerprint: fingerprintAuthValue(input.state),
      });
      return {
        redirectTo: createRedirectUri(transaction.redirectUri, {
          error: input.error,
          error_description: input.errorDescription,
          state: transaction.downstreamState,
        }),
      };
    }

    if (!input.code) {
      throw new Error("Missing upstream OAuth code.");
    }

    if (!transaction.upstreamCodeVerifier) {
      throw new Error("OAuth transaction is missing upstream PKCE verifier.");
    }

    if (!options.provider.exchangeAuthorizationCode) {
      throw new Error("Provider authorization-code exchange is not configured.");
    }

    const upstreamTokens = await options.provider.exchangeAuthorizationCode({
      callbackUri: getCallbackUri(options.config),
      code: input.code,
      codeVerifier: transaction.upstreamCodeVerifier,
    });
    const authorizationCode = options.createId();
    const subject = typeof upstreamTokens["subject"] === "string"
      ? upstreamTokens["subject"]
      : typeof upstreamTokens["sub"] === "string"
        ? upstreamTokens["sub"]
        : transaction.clientId;

    options.store.saveAuthorizationCode({
      clientId: transaction.clientId,
      code: authorizationCode,
      codeChallenge: transaction.downstreamCodeChallenge ?? "",
      codeChallengeMethod: transaction.downstreamCodeChallengeMethod ?? "S256",
      expiresAt: options.now() + options.config.authCodeTtlSec * 1000,
      redirectUri: transaction.redirectUri,
      scopes: transaction.scopes,
      subject,
      transactionId: transaction.transactionId,
      upstreamTokens,
      used: false,
    });

    logAuthEvent("auth.callback.completed", {
      authorizationCodeFingerprint: fingerprintAuthValue(authorizationCode),
      outcome: "authorization_code_issued",
      transactionId: transaction.transactionId,
      upstreamStateFingerprint: fingerprintAuthValue(input.state),
    });

    return {
      redirectTo: createRedirectUri(transaction.redirectUri, {
        code: authorizationCode,
        state: transaction.downstreamState,
      }),
    };
  }

  async function exchangeAuthorizationCode(input: {
    clientId: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }) {
    findClientConfig(options.config, options.store, input.clientId);
    logAuthEvent("auth.token.exchange.started", {
      authorizationCodeFingerprint: fingerprintAuthValue(input.code),
      clientId: input.clientId,
      redirectUriFingerprint: fingerprintAuthValue(input.redirectUri),
    });

    const authorizationCode = options.store.getAuthorizationCode(input.code);

    if (!authorizationCode || authorizationCode.clientId !== input.clientId) {
      throw new Error("Unknown authorization code.");
    }

    if (authorizationCode.used) {
      throw new Error("Authorization code has already been used.");
    }

    if (authorizationCode.expiresAt <= options.now()) {
      throw new Error("Authorization code has expired.");
    }

    if (input.redirectUri !== authorizationCode.redirectUri) {
      throw new Error("redirect_uri does not match the authorization request.");
    }

    verifyPkceCodeVerifier(input.codeVerifier, authorizationCode.codeChallenge);

    options.store.updateAuthorizationCode(input.code, {
      used: true,
      usedAt: options.now(),
    });

    const accessToken = options.createId();
    const refreshToken = options.createId();

    options.store.saveAccessToken({
      accessToken,
      clientId: authorizationCode.clientId,
      expiresAt: options.now() + options.config.accessTokenTtlSec * 1000,
      scopes: authorizationCode.scopes,
      subject: authorizationCode.subject,
      transactionId: authorizationCode.transactionId,
    });

    options.store.saveRefreshToken({
      clientId: authorizationCode.clientId,
      expiresAt: options.now() + options.config.refreshTokenTtlSec * 1000,
      refreshToken,
      scopes: authorizationCode.scopes,
      subject: authorizationCode.subject,
      transactionId: authorizationCode.transactionId,
      upstreamTokens: authorizationCode.upstreamTokens,
      used: false,
    });

    logAuthEvent("auth.token.exchange.succeeded", {
      accessTokenFingerprint: fingerprintAuthValue(accessToken),
      authorizationCodeFingerprint: fingerprintAuthValue(input.code),
      clientId: input.clientId,
      refreshTokenFingerprint: fingerprintAuthValue(refreshToken),
      transactionId: authorizationCode.transactionId,
    });

    return {
      access_token: accessToken,
      expires_in: options.config.accessTokenTtlSec,
      refresh_token: refreshToken,
      scope: authorizationCode.scopes.join(" "),
      token_type: "Bearer" as const,
    };
  }

  async function exchangeRefreshToken(input: {
    clientId: string;
    refreshToken: string;
    scopes?: string[];
  }) {
    findClientConfig(options.config, options.store, input.clientId);
    logAuthEvent("auth.refresh.exchange.started", {
      clientId: input.clientId,
      refreshTokenFingerprint: fingerprintAuthValue(input.refreshToken),
      requestedScopeCount: input.scopes?.length ?? 0,
    });

    const refreshGrant = options.store.getRefreshToken(input.refreshToken);

    if (!refreshGrant || refreshGrant.clientId !== input.clientId) {
      throw new Error("Unknown refresh token.");
    }

    if (refreshGrant.used) {
      throw new Error("Refresh token has already been used.");
    }

    if (refreshGrant.expiresAt <= options.now()) {
      throw new Error("Refresh token has expired.");
    }

    const requestedScopes = input.scopes && input.scopes.length > 0
      ? input.scopes
      : refreshGrant.scopes;

    for (const scope of requestedScopes) {
      if (!refreshGrant.scopes.includes(scope)) {
        throw new Error("Requested scope exceeds the original grant.");
      }
    }

    const upstreamRefreshToken = typeof refreshGrant.upstreamTokens["refresh_token"] === "string"
      ? refreshGrant.upstreamTokens["refresh_token"]
      : undefined;

    if (!upstreamRefreshToken) {
      throw new Error("Refresh token is missing upstream credentials.");
    }

    if (!options.provider.exchangeRefreshToken) {
      throw new Error("Provider refresh-token exchange is not configured.");
    }

    const refreshedUpstreamTokens = await options.provider.exchangeRefreshToken({
      refreshToken: upstreamRefreshToken,
    });

    options.store.updateRefreshToken(input.refreshToken, {
      used: true,
      usedAt: options.now(),
    });

    const accessToken = options.createId();
    const nextRefreshToken = options.createId();

    options.store.saveAccessToken({
      accessToken,
      clientId: refreshGrant.clientId,
      expiresAt: options.now() + options.config.accessTokenTtlSec * 1000,
      scopes: requestedScopes,
      subject: refreshGrant.subject,
      transactionId: refreshGrant.transactionId,
    });

    options.store.saveRefreshToken({
      clientId: refreshGrant.clientId,
      expiresAt: options.now() + options.config.refreshTokenTtlSec * 1000,
      refreshToken: nextRefreshToken,
      scopes: requestedScopes,
      subject: refreshGrant.subject,
      transactionId: refreshGrant.transactionId,
      upstreamTokens: {
        ...refreshGrant.upstreamTokens,
        ...refreshedUpstreamTokens,
        refresh_token: typeof refreshedUpstreamTokens["refresh_token"] === "string"
          ? refreshedUpstreamTokens["refresh_token"]
          : upstreamRefreshToken,
      },
      used: false,
    });

    logAuthEvent("auth.refresh.exchange.succeeded", {
      accessTokenFingerprint: fingerprintAuthValue(accessToken),
      clientId: input.clientId,
      nextRefreshTokenFingerprint: fingerprintAuthValue(nextRefreshToken),
      refreshTokenFingerprint: fingerprintAuthValue(input.refreshToken),
      transactionId: refreshGrant.transactionId,
    });

    return {
      access_token: accessToken,
      expires_in: options.config.accessTokenTtlSec,
      refresh_token: nextRefreshToken,
      scope: requestedScopes.join(" "),
      token_type: "Bearer" as const,
    };
  }

  return {
    exchangeAuthorizationCode,
    exchangeRefreshToken,
    handleCallback,
    startAuthorization,
  };
}
