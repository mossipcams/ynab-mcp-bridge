import * as client from "openid-client";
import { InvalidRequestError, ServerError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

export type ProviderClientConfig = {
  callbackUrl: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
} & (
  | {
      authorizationUrl: string;
      jwksUrl: string;
      metadataMode: "explicit";
      tokenUrl: string;
    }
  | {
      authorizationUrl?: string;
      fallbackToExplicit?: boolean;
      jwksUrl?: string;
      metadataMode: "discovery";
      tokenUrl?: string;
    }
);

type AuthorizationUrlInput = {
  resource: string;
  scopes: string[];
  upstreamState: string;
};

type SuccessfulAuthorizationResponse = {
  currentUrl: URL;
  type: "success";
  upstreamState: string;
};

type ErrorAuthorizationResponse = {
  error: string;
  errorDescription?: string;
  type: "error";
  upstreamState: string;
};

export type ProviderAuthorizationResponse = SuccessfulAuthorizationResponse | ErrorAuthorizationResponse;

export type ProviderClient = {
  buildAuthorizationUrl: (input: AuthorizationUrlInput) => URL;
  exchangeAuthorizationCodeResponse: (response: SuccessfulAuthorizationResponse) => Promise<OAuthTokens>;
  exchangeRefreshToken: (refreshToken: string) => Promise<OAuthTokens>;
  getMetadata: () => {
    authorizationUrl: string;
    issuer: string;
    jwksUrl: string;
    tokenUrl: string;
  };
  parseAuthorizationResponse: (currentUrl: URL) => ProviderAuthorizationResponse;
};

function getSingleSearchParam(searchParams: URLSearchParams, name: string, errorLabel: string) {
  const values = searchParams
    .getAll(name)
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length > 1) {
    throw new InvalidRequestError(`Ambiguous upstream OAuth ${errorLabel}.`);
  }

  return values[0];
}

function isInsecureUrl(url: string) {
  return new URL(url).protocol !== "https:";
}

function normalizeTokens(tokens: OAuthTokens): OAuthTokens {
  return {
    access_token: tokens.access_token,
    expires_in: tokens.expires_in,
    id_token: tokens.id_token,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope,
    token_type: typeof tokens.token_type === "string" && tokens.token_type.toLowerCase() === "bearer"
      ? "Bearer"
      : tokens.token_type,
  };
}

function mapTokenExchangeError(error: unknown, prefix: string): never {
  if (error instanceof client.ResponseBodyError) {
    throw new ServerError(`${prefix} failed with status ${error.status}.`);
  }

  if (
    error instanceof client.ClientError &&
    error.cause instanceof Response &&
    Number.isInteger(error.cause.status)
  ) {
    throw new ServerError(`${prefix} failed with status ${error.cause.status}.`);
  }

  if (error instanceof InvalidRequestError || error instanceof ServerError) {
    throw error;
  }

  throw new ServerError(`${prefix} failed.`);
}

function getResolvedProviderMetadata(configuration: client.Configuration) {
  const serverMetadata = configuration.serverMetadata();
  const authorizationUrl = typeof serverMetadata.authorization_endpoint === "string"
    ? serverMetadata.authorization_endpoint
    : undefined;
  const issuer = typeof serverMetadata.issuer === "string"
    ? serverMetadata.issuer
    : undefined;
  const jwksUrl = typeof serverMetadata.jwks_uri === "string"
    ? serverMetadata.jwks_uri
    : undefined;
  const tokenUrl = typeof serverMetadata.token_endpoint === "string"
    ? serverMetadata.token_endpoint
    : undefined;

  if (!authorizationUrl || !issuer || !jwksUrl || !tokenUrl) {
    throw new Error("OAuth discovery metadata is missing required endpoints.");
  }

  return {
    authorizationUrl,
    issuer,
    jwksUrl,
    tokenUrl,
  };
}

function createExplicitConfiguration(config: Extract<ProviderClientConfig, {
  authorizationUrl: string;
  jwksUrl: string;
  tokenUrl: string;
}>) {
  const configuration = new client.Configuration({
    authorization_endpoint: config.authorizationUrl,
    issuer: config.issuer,
    jwks_uri: config.jwksUrl,
    token_endpoint: config.tokenUrl,
  }, config.clientId, config.clientSecret);

  if (
    isInsecureUrl(config.authorizationUrl) ||
    isInsecureUrl(config.issuer) ||
    isInsecureUrl(config.jwksUrl) ||
    isInsecureUrl(config.tokenUrl)
  ) {
    client.allowInsecureRequests(configuration);
  }

  return configuration;
}

function canFallbackToExplicit(config: ProviderClientConfig): config is Extract<ProviderClientConfig, {
  authorizationUrl: string;
  fallbackToExplicit?: boolean;
  jwksUrl: string;
  metadataMode: "discovery";
  tokenUrl: string;
}> {
  return config.metadataMode === "discovery" &&
    config.fallbackToExplicit === true &&
    typeof config.authorizationUrl === "string" &&
    typeof config.jwksUrl === "string" &&
    typeof config.tokenUrl === "string";
}

async function createConfiguration(config: ProviderClientConfig) {
  if (config.metadataMode === "explicit") {
    return createExplicitConfiguration(config);
  }

  try {
    const configuration = await client.discovery(
      new URL(config.issuer),
      config.clientId,
      config.clientSecret,
      undefined,
      isInsecureUrl(config.issuer)
        ? {
            execute: [client.allowInsecureRequests],
          }
        : undefined,
    );

    getResolvedProviderMetadata(configuration);
    return configuration;
  } catch (error) {
    if (canFallbackToExplicit(config)) {
      return createExplicitConfiguration(config);
    }
    throw error;
  }
}

export async function createProviderClient(config: ProviderClientConfig): Promise<ProviderClient> {
  const configuration = await createConfiguration(config);
  const metadata = getResolvedProviderMetadata(configuration);

  return {
    buildAuthorizationUrl(input) {
      const parameters = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.callbackUrl,
        response_type: "code",
        state: input.upstreamState,
      });

      if (input.scopes.length > 0) {
        parameters.set("scope", input.scopes.join(" "));
      }

      parameters.set("resource", input.resource);

      return client.buildAuthorizationUrl(configuration, parameters);
    },
    async exchangeAuthorizationCodeResponse(response) {
      const parsedResponse = getSingleSearchParam(response.currentUrl.searchParams, "state", "state");

      if (parsedResponse !== response.upstreamState) {
        throw new InvalidRequestError("Invalid upstream OAuth state.");
      }

      try {
        const tokenResponse = await client.authorizationCodeGrant(
          configuration,
          response.currentUrl,
          {
            expectedState: response.upstreamState,
          },
          new URLSearchParams({
            redirect_uri: config.callbackUrl,
          }),
        );

        return normalizeTokens(tokenResponse as OAuthTokens);
      } catch (error) {
        mapTokenExchangeError(error, "Upstream token exchange");
      }
    },
    async exchangeRefreshToken(refreshToken) {
      try {
        const tokenResponse = await client.refreshTokenGrant(configuration, refreshToken);
        return normalizeTokens(tokenResponse as OAuthTokens);
      } catch (error) {
        mapTokenExchangeError(error, "Upstream refresh exchange");
      }
    },
    getMetadata() {
      return {
        ...metadata,
      };
    },
    parseAuthorizationResponse(currentUrl) {
      const upstreamState = getSingleSearchParam(currentUrl.searchParams, "state", "state");

      if (!upstreamState) {
        throw new InvalidRequestError("Missing upstream OAuth state.");
      }

      const code = getSingleSearchParam(currentUrl.searchParams, "code", "code");
      const error = getSingleSearchParam(currentUrl.searchParams, "error", "error");
      const errorDescription = getSingleSearchParam(currentUrl.searchParams, "error_description", "error description");

      if (code && error) {
        throw new InvalidRequestError("Ambiguous upstream OAuth response.");
      }

      if (error) {
        return {
          error,
          errorDescription,
          type: "error",
          upstreamState,
        };
      }

      if (!code) {
        throw new InvalidRequestError("Missing upstream OAuth result.");
      }

      return {
        currentUrl,
        type: "success",
        upstreamState,
      };
    },
  };
}
