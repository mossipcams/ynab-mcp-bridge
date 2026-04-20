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
  tokenExchangeCallback?: (input: {
    clientId: string;
    grantType: "authorization_code" | "refresh_token";
    props: Record<string, unknown>;
    scope: string[];
    subject: string;
    transactionId: string;
    upstreamTokens: Record<string, unknown>;
  }) => Promise<{
    accessTokenProps?: Record<string, unknown>;
    accessTokenTtlSec?: number;
    newProps?: Record<string, unknown>;
    refreshTokenTtlSec?: number;
  } | void> | {
    accessTokenProps?: Record<string, unknown>;
    accessTokenTtlSec?: number;
    newProps?: Record<string, unknown>;
    refreshTokenTtlSec?: number;
  } | void;
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

function getUpstreamAccessTokenTtlSec(upstreamTokens: Record<string, unknown>) {
  if (typeof upstreamTokens["refresh_token"] === "string") {
    return undefined;
  }

  const expiresIn = upstreamTokens["expires_in"];

  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return undefined;
  }

  return Math.floor(expiresIn);
}

async function resolveTokenExchangeOutcome(
  options: CreateAuthCoreOptions,
  input: {
    clientId: string;
    currentProps?: Record<string, unknown>;
    defaultRefreshTokenTtlSec: number;
    defaultAccessTokenTtlSec: number;
    grantType: "authorization_code" | "refresh_token";
    scope: string[];
    subject: string;
    transactionId: string;
    upstreamTokens: Record<string, unknown>;
  },
) {
  const currentProps = input.currentProps ?? {};
  const callbackResult = options.tokenExchangeCallback
    ? await options.tokenExchangeCallback({
        clientId: input.clientId,
        grantType: input.grantType,
        props: currentProps,
        scope: input.scope,
        subject: input.subject,
        transactionId: input.transactionId,
        upstreamTokens: input.upstreamTokens,
      })
    : undefined;
  const grantProps = callbackResult?.newProps ?? currentProps;
  const upstreamAccessTokenTtlSec = getUpstreamAccessTokenTtlSec(input.upstreamTokens);
  const defaultAccessTokenTtlSec = upstreamAccessTokenTtlSec === undefined
    ? input.defaultAccessTokenTtlSec
    : Math.min(input.defaultAccessTokenTtlSec, upstreamAccessTokenTtlSec);

  return {
    accessTokenProps: callbackResult?.accessTokenProps ?? grantProps,
    accessTokenTtlSec: callbackResult?.accessTokenTtlSec ?? defaultAccessTokenTtlSec,
    grantProps,
    refreshTokenTtlSec: callbackResult?.refreshTokenTtlSec ?? input.defaultRefreshTokenTtlSec,
  };
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
    const grantId = options.createId();
    const upstreamRefreshToken = typeof authorizationCode.upstreamTokens["refresh_token"] === "string"
      ? authorizationCode.upstreamTokens["refresh_token"]
      : undefined;
    const refreshToken = upstreamRefreshToken ? options.createId() : undefined;
    const tokenExchangeOutcome = await resolveTokenExchangeOutcome(options, {
      clientId: authorizationCode.clientId,
      ...(authorizationCode.props === undefined ? {} : { currentProps: authorizationCode.props }),
      defaultAccessTokenTtlSec: options.config.accessTokenTtlSec,
      defaultRefreshTokenTtlSec: options.config.refreshTokenTtlSec,
      grantType: "authorization_code",
      scope: authorizationCode.scopes,
      subject: authorizationCode.subject,
      transactionId: authorizationCode.transactionId,
      upstreamTokens: authorizationCode.upstreamTokens,
    });

    options.store.saveGrant({
      clientId: authorizationCode.clientId,
      grantId,
      ...(Object.keys(tokenExchangeOutcome.grantProps).length === 0 ? {} : { props: tokenExchangeOutcome.grantProps }),
      scopes: authorizationCode.scopes,
      subject: authorizationCode.subject,
      transactionId: authorizationCode.transactionId,
      upstreamTokens: authorizationCode.upstreamTokens,
    });

    options.store.saveAccessToken({
      accessToken,
      clientId: authorizationCode.clientId,
      expiresAt: options.now() + tokenExchangeOutcome.accessTokenTtlSec * 1000,
      grantId,
      ...(Object.keys(tokenExchangeOutcome.accessTokenProps).length === 0 ? {} : { props: tokenExchangeOutcome.accessTokenProps }),
      scopes: authorizationCode.scopes,
      subject: authorizationCode.subject,
      transactionId: authorizationCode.transactionId,
    });

    if (refreshToken) {
      options.store.saveRefreshToken({
        active: true,
        expiresAt: options.now() + tokenExchangeOutcome.refreshTokenTtlSec * 1000,
        grantId,
        refreshToken,
      });
    }

    logAuthEvent("auth.token.exchange.succeeded", {
      accessTokenFingerprint: fingerprintAuthValue(accessToken),
      authorizationCodeFingerprint: fingerprintAuthValue(input.code),
      clientId: input.clientId,
      transactionId: authorizationCode.transactionId,
      ...(refreshToken ? { refreshTokenFingerprint: fingerprintAuthValue(refreshToken) } : {}),
    });

    return {
      access_token: accessToken,
      expires_in: tokenExchangeOutcome.accessTokenTtlSec,
      scope: authorizationCode.scopes.join(" "),
      token_type: "Bearer" as const,
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
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
    try {
      const refreshGrant = options.store.getRefreshToken(input.refreshToken);

      if (!refreshGrant) {
        throw new Error("Unknown refresh token.");
      }

      if (!refreshGrant.active) {
        throw new Error("Refresh token is no longer active.");
      }

      if (refreshGrant.expiresAt <= options.now()) {
        throw new Error("Refresh token has expired.");
      }

      const grant = options.store.getGrant(refreshGrant.grantId);

      if (!grant || grant.clientId !== input.clientId) {
        throw new Error("Unknown refresh token.");
      }

      const requestedScopes = input.scopes && input.scopes.length > 0
        ? input.scopes
        : grant.scopes;

      for (const scope of requestedScopes) {
        if (!grant.scopes.includes(scope)) {
          throw new Error("Requested scope exceeds the original grant.");
        }
      }

      const upstreamRefreshToken = typeof grant.upstreamTokens["refresh_token"] === "string"
        ? grant.upstreamTokens["refresh_token"]
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

      const accessToken = options.createId();
      const nextRefreshToken = options.createId();
      const mergedUpstreamTokens = {
        ...grant.upstreamTokens,
        ...refreshedUpstreamTokens,
        refresh_token: typeof refreshedUpstreamTokens["refresh_token"] === "string"
          ? refreshedUpstreamTokens["refresh_token"]
          : upstreamRefreshToken,
      };
      const tokenExchangeOutcome = await resolveTokenExchangeOutcome(options, {
        clientId: grant.clientId,
        ...(grant.props === undefined ? {} : { currentProps: grant.props }),
        defaultAccessTokenTtlSec: options.config.accessTokenTtlSec,
        defaultRefreshTokenTtlSec: options.config.refreshTokenTtlSec,
        grantType: "refresh_token",
        scope: requestedScopes,
        subject: grant.subject,
        transactionId: grant.transactionId,
        upstreamTokens: mergedUpstreamTokens,
      });

      options.store.updateGrant(grant.grantId, Object.keys(tokenExchangeOutcome.grantProps).length === 0
        ? {
            scopes: requestedScopes,
            upstreamTokens: mergedUpstreamTokens,
          }
        : {
            props: tokenExchangeOutcome.grantProps,
            scopes: requestedScopes,
            upstreamTokens: mergedUpstreamTokens,
          });

      options.store.saveAccessToken({
        accessToken,
        clientId: grant.clientId,
        expiresAt: options.now() + tokenExchangeOutcome.accessTokenTtlSec * 1000,
        grantId: grant.grantId,
        ...(Object.keys(tokenExchangeOutcome.accessTokenProps).length === 0 ? {} : { props: tokenExchangeOutcome.accessTokenProps }),
        scopes: requestedScopes,
        subject: grant.subject,
        transactionId: grant.transactionId,
      });

      options.store.retireOtherRefreshTokens(grant.grantId, [input.refreshToken], options.now());
      options.store.updateRefreshToken(input.refreshToken, {
        active: true,
        lastUsedAt: options.now(),
      });
      options.store.saveRefreshToken({
        active: true,
        expiresAt: options.now() + tokenExchangeOutcome.refreshTokenTtlSec * 1000,
        grantId: grant.grantId,
        refreshToken: nextRefreshToken,
      });

      logAuthEvent("auth.refresh.exchange.succeeded", {
        accessTokenFingerprint: fingerprintAuthValue(accessToken),
        clientId: input.clientId,
        nextRefreshTokenFingerprint: fingerprintAuthValue(nextRefreshToken),
        refreshTokenFingerprint: fingerprintAuthValue(input.refreshToken),
        transactionId: grant.transactionId,
      });

      return {
        access_token: accessToken,
        expires_in: tokenExchangeOutcome.accessTokenTtlSec,
        refresh_token: nextRefreshToken,
        scope: requestedScopes.join(" "),
        token_type: "Bearer" as const,
      };
    } catch (error) {
      logAuthEvent("auth.refresh.exchange.failed", {
        clientId: input.clientId,
        errorMessage: error instanceof Error ? error.message : String(error),
        refreshTokenFingerprint: fingerprintAuthValue(input.refreshToken),
      });
      throw error;
    }
  }

  return {
    exchangeAuthorizationCode,
    exchangeRefreshToken,
    handleCallback,
    startAuthorization,
  };
}
