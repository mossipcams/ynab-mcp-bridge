import type { AuthConfig } from "../config/schema.js";

type FetchLike = typeof fetch;

type BuildAuthorizationUrlInput = {
  callbackUri: string;
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scopes: string[];
  state: string;
};

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
      const response = await fetchFn(config.provider.tokenEndpoint, {
        body: new URLSearchParams({
          client_id: config.provider.clientId,
          ...(config.provider.clientSecret ? { client_secret: config.provider.clientSecret } : {}),
          code: input.code,
          code_verifier: input.codeVerifier,
          grant_type: "authorization_code",
          redirect_uri: input.callbackUri,
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Provider token exchange failed with status ${response.status}.`);
      }

      return await response.json() as Record<string, unknown>;
    },
    async exchangeRefreshToken(input: {
      refreshToken: string;
    }) {
      const response = await fetchFn(config.provider.tokenEndpoint, {
        body: new URLSearchParams({
          client_id: config.provider.clientId,
          ...(config.provider.clientSecret ? { client_secret: config.provider.clientSecret } : {}),
          grant_type: "refresh_token",
          refresh_token: input.refreshToken,
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Provider refresh exchange failed with status ${response.status}.`);
      }

      return await response.json() as Record<string, unknown>;
    },
  };
}
