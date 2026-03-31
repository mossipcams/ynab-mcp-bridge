import type { AuthConfig } from "../config/schema.js";
import { logAppEvent } from "../../logger.js";
import { getRequestLogFields } from "../../requestContext.js";
import { getStringValue, isRecord } from "../../typeUtils.js";

type FetchLike = typeof fetch;

type BuildAuthorizationUrlInput = {
  callbackUri: string;
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scopes: string[];
  state: string;
};

function logUpstreamTokenEvent(event: string, details: Record<string, unknown>) {
  logAppEvent("oauth", event, {
    ...getRequestLogFields(),
    ...details,
  });
}

function getUpstreamUrlDetails(url: string) {
  const parsedUrl = new URL(url);

  return {
    upstreamHost: parsedUrl.host,
    upstreamOrigin: parsedUrl.origin,
    upstreamPath: parsedUrl.pathname,
  };
}

function getTokenRequestDetails(
  body: URLSearchParams,
  url: string,
  grantType: "authorization_code" | "refresh_token",
) {
  return {
    grantType,
    hasClientId: body.has("client_id"),
    hasClientSecretInput: body.has("client_secret"),
    hasCode: body.has("code"),
    hasCodeVerifier: body.has("code_verifier"),
    hasRedirectUri: body.has("redirect_uri"),
    hasRefreshToken: body.has("refresh_token"),
    requestFields: Array.from(new Set(body.keys())).sort(),
    ...getUpstreamUrlDetails(url),
  };
}

function getTokenResponseDetails(tokens: Record<string, unknown>, status: number, url: string) {
  return {
    hasAccessToken: typeof tokens["access_token"] === "string" && tokens["access_token"].length > 0,
    hasExpiresIn: typeof tokens["expires_in"] === "number",
    hasRefreshToken: typeof tokens["refresh_token"] === "string" && tokens["refresh_token"].length > 0,
    hasScope: typeof tokens["scope"] === "string" && tokens["scope"].length > 0,
    hasTokenType: typeof tokens["token_type"] === "string" && tokens["token_type"].length > 0,
    tokenResponseFields: Object.keys(tokens).sort(),
    upstreamStatus: status,
    ...getUpstreamUrlDetails(url),
  };
}

function summarizeUpstreamTokenError(bodyText: string, status: number) {
  const details: Record<string, unknown> = {
    upstreamStatus: status,
  };

  if (!bodyText.trim()) {
    return details;
  }

  try {
    const parsed: unknown = JSON.parse(bodyText);

    if (!isRecord(parsed)) {
      return details;
    }

    const error = getStringValue(parsed, "error");
    const errorDescription = getStringValue(parsed, "error_description");
    const errorFields = [
      ...(error ? ["error"] : []),
      ...(errorDescription ? ["error_description"] : []),
    ];

    return {
      ...details,
      responseFields: Object.keys(parsed).sort(),
      ...(error ? { upstreamError: error } : {}),
      ...(errorDescription ? { upstreamErrorDescription: errorDescription } : {}),
      ...(errorFields.length > 0 ? { upstreamErrorFields: errorFields } : {}),
    };
  } catch {
    return details;
  }
}

async function exchangeTokens(
  fetchFn: FetchLike,
  url: string,
  body: URLSearchParams,
  failureMessage: string,
  grantType: "authorization_code" | "refresh_token",
) {
  const requestDetails = getTokenRequestDetails(body, url, grantType);
  logUpstreamTokenEvent("upstream.token.request.started", requestDetails);
  let response: Response;

  try {
    response = await fetchFn(url, {
      body,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });
  } catch {
    logUpstreamTokenEvent("upstream.token.request.failed", {
      ...requestDetails,
      failureKind: "network_error",
    });
    throw new Error(`${failureMessage} due to a network error.`);
  }

  if (!response.ok) {
    const bodyText = await response.text();

    logUpstreamTokenEvent("upstream.token.request.failed", {
      ...requestDetails,
      failureKind: "http_error",
      responseBodyPresent: bodyText.trim().length > 0,
      ...summarizeUpstreamTokenError(bodyText, response.status),
    });
    throw new Error(`${failureMessage} with status ${response.status}.`);
  }

  let tokens: unknown;

  try {
    tokens = await response.json();
  } catch {
    logUpstreamTokenEvent("upstream.token.request.failed", {
      ...requestDetails,
      failureKind: "invalid_json",
      responseContentType: response.headers.get("content-type") ?? undefined,
      upstreamStatus: response.status,
    });
    throw new Error("Provider token exchange returned an invalid JSON response.");
  }

  if (!isRecord(tokens) || typeof tokens["access_token"] !== "string") {
    logUpstreamTokenEvent("upstream.token.request.failed", {
      ...requestDetails,
      failureKind: "invalid_token_payload",
      responseFields: isRecord(tokens) ? Object.keys(tokens).sort() : undefined,
      upstreamStatus: response.status,
    });
    throw new Error("Provider token exchange returned an invalid token payload.");
  }

  logUpstreamTokenEvent("upstream.token.request.succeeded", {
    ...requestDetails,
    ...getTokenResponseDetails(tokens, response.status, url),
  });

  return tokens;
}

export function createProviderAdapter(config: AuthConfig, fetchFn: FetchLike) {
  return {
    buildAuthorizationUrl(input: BuildAuthorizationUrlInput) {
      const url = new URL(config.provider.authorizationEndpoint);

      url.searchParams.set("client_id", input.clientId);
      url.searchParams.set("redirect_uri", input.callbackUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("state", input.state);
      url.searchParams.set("code_challenge", input.codeChallenge);
      url.searchParams.set("code_challenge_method", input.codeChallengeMethod);
      url.searchParams.set("scope", input.scopes.join(" "));

      return url.href;
    },
    async exchangeAuthorizationCode(input: {
      callbackUri: string;
      code: string;
      codeVerifier: string;
    }) {
      return await exchangeTokens(fetchFn, config.provider.tokenEndpoint, new URLSearchParams({
          client_id: config.provider.clientId,
          ...(config.provider.clientSecret ? { client_secret: config.provider.clientSecret } : {}),
          code: input.code,
          code_verifier: input.codeVerifier,
          grant_type: "authorization_code",
          redirect_uri: input.callbackUri,
        }), "Provider token exchange failed", "authorization_code");
    },
    async exchangeRefreshToken(input: {
      refreshToken: string;
    }) {
      return await exchangeTokens(fetchFn, config.provider.tokenEndpoint, new URLSearchParams({
          client_id: config.provider.clientId,
          ...(config.provider.clientSecret ? { client_secret: config.provider.clientSecret } : {}),
          grant_type: "refresh_token",
          refresh_token: input.refreshToken,
        }), "Provider refresh exchange failed", "refresh_token");
    },
  };
}
