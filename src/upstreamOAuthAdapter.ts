import { ServerError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

import { logAppEvent } from "./logger.js";
import { getRequestLogFields } from "./requestContext.js";
import { getStringValue, isRecord } from "./typeUtils.js";

type UpstreamAuthorizationRecord = {
  resource: string;
  scopes: string[];
  upstreamState: string;
};

type CreateUpstreamOAuthAdapterOptions = {
  authorizationUrl: string;
  callbackUrl: string;
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
};

type UpstreamOAuthAdapter = {
  buildAuthorizationUrl: (record: UpstreamAuthorizationRecord) => URL;
  exchangeAuthorizationCode: (code: string) => Promise<OAuthTokens>;
  exchangeRefreshToken: (refreshToken: string) => Promise<OAuthTokens>;
};

type UpstreamTokenErrorDetails = {
  responseFields?: string[];
  upstreamError?: string;
  upstreamErrorDescription?: string;
  upstreamErrorFields?: string[];
  upstreamStatus: number;
};

class UpstreamTokenExchangeError extends ServerError {
  upstreamError: string | undefined;
  upstreamErrorDescription: string | undefined;
  upstreamErrorFields: string[] | undefined;
  upstreamStatus: number;

  constructor(message: string, details: UpstreamTokenErrorDetails) {
    super(message);
    this.name = "ServerError";
    this.upstreamError = details.upstreamError;
    this.upstreamErrorDescription = details.upstreamErrorDescription;
    this.upstreamErrorFields = details.upstreamErrorFields;
    this.upstreamStatus = details.upstreamStatus;
  }
}

function summarizeUpstreamTokenError(bodyText: string, status: number): UpstreamTokenErrorDetails {
  const details: UpstreamTokenErrorDetails = {
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

function isOAuthTokens(value: unknown): value is OAuthTokens {
  return isRecord(value) && typeof value["access_token"] === "string";
}

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

function getTokenRequestDetails(body: URLSearchParams, url: string, grantType: "authorization_code" | "refresh_token") {
  return {
    grantType,
    hasClientId: body.has("client_id"),
    hasClientSecretInput: body.has("client_secret"),
    hasCode: body.has("code"),
    hasRedirectUri: body.has("redirect_uri"),
    hasRefreshToken: body.has("refresh_token"),
    requestFields: Array.from(new Set(body.keys())).sort(),
    ...getUpstreamUrlDetails(url),
  };
}

function getTokenResponseDetails(tokens: OAuthTokens, status: number, url: string) {
  return {
    hasAccessToken: typeof tokens.access_token === "string" && tokens.access_token.length > 0,
    hasExpiresIn: typeof tokens.expires_in === "number",
    hasRefreshToken: typeof tokens.refresh_token === "string" && tokens.refresh_token.length > 0,
    hasScope: typeof tokens.scope === "string" && tokens.scope.length > 0,
    hasTokenType: typeof tokens.token_type === "string" && tokens.token_type.length > 0,
    tokenResponseFields: Object.keys(tokens).sort(),
    upstreamStatus: status,
    ...getUpstreamUrlDetails(url),
  };
}

function getTokenFailureDetails(
  requestDetails: ReturnType<typeof getTokenRequestDetails>,
  details: Record<string, unknown>,
) {
  return {
    ...requestDetails,
    ...details,
  };
}

async function exchangeTokens(
  url: string,
  body: URLSearchParams,
  failureMessage: string,
  grantType: "authorization_code" | "refresh_token",
) {
  const requestDetails = getTokenRequestDetails(body, url, grantType);

  logUpstreamTokenEvent("upstream.token.request.started", requestDetails);
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch {
    logUpstreamTokenEvent("upstream.token.request.failed", getTokenFailureDetails(requestDetails, {
      failureKind: "network_error",
    }));
    throw new ServerError(`${failureMessage} due to a network error.`);
  }

  if (!response.ok) {
    const bodyText = await response.text();
    const errorDetails = summarizeUpstreamTokenError(bodyText, response.status);

    logUpstreamTokenEvent("upstream.token.request.failed", getTokenFailureDetails(requestDetails, {
      failureKind: "http_error",
      responseBodyPresent: bodyText.trim().length > 0,
      ...errorDetails,
    }));

    throw new UpstreamTokenExchangeError(
      `${failureMessage} with status ${response.status}.`,
      errorDetails,
    );
  }

  let tokens: unknown;

  try {
    tokens = await response.json();
  } catch {
    logUpstreamTokenEvent("upstream.token.request.failed", getTokenFailureDetails(requestDetails, {
      failureKind: "invalid_json",
      responseContentType: response.headers.get("content-type") ?? undefined,
      upstreamStatus: response.status,
    }));
    throw new ServerError("Upstream token exchange returned an invalid JSON response.");
  }

  if (!isOAuthTokens(tokens)) {
    logUpstreamTokenEvent("upstream.token.request.failed", getTokenFailureDetails(requestDetails, {
      failureKind: "invalid_token_payload",
      responseFields: isRecord(tokens) ? Object.keys(tokens).sort() : undefined,
      upstreamStatus: response.status,
    }));
    throw new ServerError("Upstream token exchange returned an invalid token payload.");
  }

  logUpstreamTokenEvent("upstream.token.request.succeeded", {
    ...requestDetails,
    ...getTokenResponseDetails(tokens, response.status, url),
  });

  return tokens;
}

export function createUpstreamOAuthAdapter(options: CreateUpstreamOAuthAdapterOptions): UpstreamOAuthAdapter {
  return {
    buildAuthorizationUrl(record) {
      const url = new URL(options.authorizationUrl);

      url.searchParams.set("client_id", options.clientId);
      url.searchParams.set("redirect_uri", options.callbackUrl);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("state", record.upstreamState);

      if (record.scopes.length > 0) {
        url.searchParams.set("scope", record.scopes.join(" "));
      }

      url.searchParams.set("resource", record.resource);

      return url;
    },
    async exchangeAuthorizationCode(code) {
      return await exchangeTokens(options.tokenUrl, new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: options.clientId,
        client_secret: options.clientSecret,
        redirect_uri: options.callbackUrl,
      }), "Upstream token exchange failed", "authorization_code");
    },
    async exchangeRefreshToken(refreshToken) {
      return await exchangeTokens(options.tokenUrl, new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: options.clientId,
        client_secret: options.clientSecret,
      }), "Upstream refresh exchange failed", "refresh_token");
    },
  };
}
