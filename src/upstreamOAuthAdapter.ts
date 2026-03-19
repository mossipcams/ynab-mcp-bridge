import { ServerError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

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
  upstreamError?: string;
  upstreamErrorDescription?: string;
  upstreamErrorFields?: string[];
  upstreamStatus: number;
};

class UpstreamTokenExchangeError extends ServerError {
  upstreamError?: string;
  upstreamErrorDescription?: string;
  upstreamErrorFields?: string[];
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
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    const error = typeof parsed.error === "string" ? parsed.error : undefined;
    const errorDescription = typeof parsed.error_description === "string"
      ? parsed.error_description
      : undefined;
    const errorFields = [
      ...(error ? ["error"] : []),
      ...(errorDescription ? ["error_description"] : []),
    ];

    return {
      ...details,
      upstreamError: error,
      upstreamErrorDescription: errorDescription,
      upstreamErrorFields: errorFields.length > 0 ? errorFields : undefined,
    };
  } catch {
    return details;
  }
}

async function exchangeTokens(url: string, body: URLSearchParams, failureMessage: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new UpstreamTokenExchangeError(
      `${failureMessage} with status ${response.status}.`,
      summarizeUpstreamTokenError(bodyText, response.status),
    );
  }

  return await response.json() as OAuthTokens;
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
      }), "Upstream token exchange failed");
    },
    async exchangeRefreshToken(refreshToken) {
      return await exchangeTokens(options.tokenUrl, new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: options.clientId,
        client_secret: options.clientSecret,
      }), "Upstream refresh exchange failed");
    },
  };
}
