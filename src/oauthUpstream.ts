import {
  ServerError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

type UpstreamClientConfig = {
  authorizationUrl: string;
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
};

export function createUpstreamClient(config: UpstreamClientConfig, callbackUrl: string) {
  async function exchangeUpstreamAuthorizationCode(code: string) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: callbackUrl,
    });
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      throw new ServerError(`Upstream token exchange failed with status ${response.status}.`);
    }

    return await response.json() as OAuthTokens;
  }

  async function exchangeUpstreamRefreshToken(refreshToken: string) {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      throw new ServerError(`Upstream refresh exchange failed with status ${response.status}.`);
    }

    return await response.json() as OAuthTokens;
  }

  function buildUpstreamAuthorizationUrl(pending: {
    resource: string;
    scopes: string[];
    upstreamState: string;
  }) {
    const upstreamAuthorizationUrl = new URL(config.authorizationUrl);
    upstreamAuthorizationUrl.searchParams.set("client_id", config.clientId);
    upstreamAuthorizationUrl.searchParams.set("redirect_uri", callbackUrl);
    upstreamAuthorizationUrl.searchParams.set("response_type", "code");
    upstreamAuthorizationUrl.searchParams.set("state", pending.upstreamState);

    if (pending.scopes.length > 0) {
      upstreamAuthorizationUrl.searchParams.set("scope", pending.scopes.join(" "));
    }

    upstreamAuthorizationUrl.searchParams.set("resource", pending.resource);

    return upstreamAuthorizationUrl;
  }

  return {
    buildUpstreamAuthorizationUrl,
    exchangeUpstreamAuthorizationCode,
    exchangeUpstreamRefreshToken,
  };
}
