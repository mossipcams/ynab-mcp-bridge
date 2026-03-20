import {
  InvalidClientMetadataError,
  InvalidRequestError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { z } from "zod/v4";

const unsupportedClientMetadataFields = [
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

const clientMetadataSchema = z.looseObject({
  grant_types: z.array(z.string()).optional(),
  redirect_uris: z.unknown(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
  client_uri: z.unknown().optional(),
  contacts: z.unknown().optional(),
  jwks: z.unknown().optional(),
  jwks_uri: z.unknown().optional(),
  logo_uri: z.unknown().optional(),
  policy_uri: z.unknown().optional(),
  software_id: z.unknown().optional(),
  software_statement: z.unknown().optional(),
  software_version: z.unknown().optional(),
  tos_uri: z.unknown().optional(),
});

const authorizationRequestSchema = z.object({
  codeChallenge: z.string().min(1, { message: "code_challenge is required." }),
  redirectUri: z.string().min(1, { message: "redirect_uri is required." }),
  resource: z.instanceof(URL).optional(),
  scopes: z.array(z.string()).optional(),
  state: z.string().optional(),
});

const consentBodySchema = z.object({
  action: z.unknown().optional(),
  consent_challenge: z.unknown().optional(),
});

const callbackQuerySchema = z.object({
  code: z.unknown().optional(),
  error: z.unknown().optional(),
  error_description: z.unknown().optional(),
  state: z.unknown().optional(),
});

type ClientMetadataInput = z.infer<typeof clientMetadataSchema>;

type AuthorizationRequestInput = {
  codeChallenge: string;
  redirectUri: string;
  resource?: URL;
  scopes?: string[];
  state?: string;
};

function getFirstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid OAuth request.";
}

function getRedirectUrisError(redirectUris: unknown): string | undefined {
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return "redirect_uris must contain at least one https redirect URI.";
  }

  for (const redirectUri of redirectUris) {
    if (typeof redirectUri !== "string") {
      return "redirect_uris must contain at least one https redirect URI.";
    }

    let parsedRedirectUri: URL;

    try {
      parsedRedirectUri = new URL(redirectUri);
    } catch {
      return `redirect_uris must contain valid absolute URLs: ${redirectUri}`;
    }

    if (parsedRedirectUri.protocol !== "https:") {
      return `redirect_uris must use https: ${redirectUri}`;
    }
  }
}

function getUnsupportedClientMetadataFieldError(client: ClientMetadataInput): string | undefined {
  const unsupportedField = unsupportedClientMetadataFields.find((field) => client[field] !== undefined);

  if (unsupportedField) {
    return `${unsupportedField} is not supported by this bridge.`;
  }
}

function getGrantTypeError(grantTypes?: string[]): string | undefined {
  const allowedGrantTypes = new Set(["authorization_code", "refresh_token"]);
  const invalidGrantType = (grantTypes ?? ["authorization_code"])
    .find((grantType) => !allowedGrantTypes.has(grantType));

  if (invalidGrantType) {
    return `Unsupported grant type: ${invalidGrantType}`;
  }
}

function getResponseTypeError(responseTypes?: string[]): string | undefined {
  const resolvedResponseTypes = responseTypes ?? ["code"];
  const invalidResponseType = resolvedResponseTypes.find((responseType) => responseType !== "code");

  if (invalidResponseType) {
    return `Unsupported response type: ${invalidResponseType}`;
  }

  if (resolvedResponseTypes.length !== 1 || resolvedResponseTypes[0] !== "code") {
    return "response_types must be exactly [\"code\"].";
  }
}

function getTokenEndpointAuthMethodError(tokenEndpointAuthMethod?: string): string | undefined {
  const resolvedAuthMethod = tokenEndpointAuthMethod ?? "none";

  if (resolvedAuthMethod !== "client_secret_post" && resolvedAuthMethod !== "none") {
    return `Unsupported token endpoint auth method: ${resolvedAuthMethod}`;
  }
}

function getClientMetadataValidationError(client: ClientMetadataInput): string | undefined {
  return getRedirectUrisError(client.redirect_uris)
    ?? getUnsupportedClientMetadataFieldError(client)
    ?? getGrantTypeError(client.grant_types)
    ?? getResponseTypeError(client.response_types)
    ?? getTokenEndpointAuthMethodError(client.token_endpoint_auth_method);
}

function getSingleStringError(
  value: unknown,
  fieldName: string,
  options: {
    missingMessage?: string;
  } = {},
): string | undefined {
  if (value === undefined || value === null || value === "") {
    return options.missingMessage;
  }

  if (typeof value !== "string") {
    return `${fieldName} must be a single string.`;
  }
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function parseClientMetadata(
  client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
): Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at"> {
  const result = clientMetadataSchema.safeParse(client);

  if (!result.success) {
    throw new InvalidClientMetadataError(getFirstIssueMessage(result.error));
  }

  const validationError = getClientMetadataValidationError(result.data);

  if (validationError) {
    throw new InvalidClientMetadataError(validationError);
  }

  return client;
}

export function parseAuthorizationRequest(input: AuthorizationRequestInput): AuthorizationRequestInput {
  const result = authorizationRequestSchema.safeParse(input);

  if (!result.success) {
    throw new InvalidRequestError(getFirstIssueMessage(result.error));
  }

  return {
    codeChallenge: result.data.codeChallenge,
    redirectUri: result.data.redirectUri,
    ...(result.data.resource ? { resource: result.data.resource } : {}),
    ...(result.data.scopes ? { scopes: result.data.scopes } : {}),
    ...(result.data.state ? { state: result.data.state } : {}),
  };
}

export function parseConsentRequestBody(body: unknown): {
  action?: string;
  consentChallenge: string;
} {
  const result = consentBodySchema.safeParse(body);

  if (!result.success) {
    throw new InvalidRequestError(getFirstIssueMessage(result.error));
  }

  const actionError = getSingleStringError(result.data.action, "action");

  if (actionError) {
    throw new InvalidRequestError(actionError);
  }

  const consentChallengeError = getSingleStringError(
    result.data.consent_challenge,
    "consent_challenge",
    { missingMessage: "Missing consent challenge." },
  );

  if (consentChallengeError) {
    throw new InvalidRequestError(consentChallengeError);
  }

  const action = toOptionalString(result.data.action);
  const consentChallenge = toOptionalString(result.data.consent_challenge);

  if (typeof consentChallenge !== "string") {
    throw new InvalidRequestError("Missing consent challenge.");
  }

  return {
    ...(action ? { action } : {}),
    consentChallenge,
  };
}

export function parseCallbackQuery(query: unknown): {
  code?: string;
  error?: string;
  errorDescription?: string;
  hasCode: boolean;
  hasError: boolean;
  hasState: boolean;
  upstreamState?: string;
} {
  const result = callbackQuerySchema.safeParse(query);

  if (!result.success) {
    throw new InvalidRequestError(getFirstIssueMessage(result.error));
  }

  const fieldValidationError = getSingleStringError(result.data.code, "code")
    ?? getSingleStringError(result.data.error, "error")
    ?? getSingleStringError(result.data.error_description, "error_description")
    ?? getSingleStringError(result.data.state, "state");

  if (fieldValidationError) {
    throw new InvalidRequestError(fieldValidationError);
  }

  const code = toOptionalString(result.data.code);
  const error = toOptionalString(result.data.error);
  const errorDescription = toOptionalString(result.data.error_description);
  const upstreamState = toOptionalString(result.data.state);

  return {
    ...(code ? { code } : {}),
    ...(error ? { error } : {}),
    ...(errorDescription ? { errorDescription } : {}),
    hasCode: typeof code === "string" && code.length > 0,
    hasError: typeof error === "string",
    hasState: typeof upstreamState === "string" && upstreamState.length > 0,
    ...(upstreamState ? { upstreamState } : {}),
  };
}
