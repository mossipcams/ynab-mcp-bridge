import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

import type { ClientProfileId } from "./clientProfiles/types.js";
import {
  normalizeGrant,
  normalizeScopes,
  type OAuthGrantUpstreamTokens,
  type OAuthGrant,
} from "./oauthGrant.js";

export type ApprovalRecord = {
  clientId: string;
  resource: string;
  scopes: string[];
};

export type PersistedOAuthState = {
  approvals: ApprovalRecord[];
  clients: Record<string, OAuthClientInformationFull>;
  clientProfiles: Record<string, ClientProfileId>;
  grants: Record<string, OAuthGrant>;
  version: 2;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApprovalRecord(value: unknown): value is ApprovalRecord {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value["clientId"] === "string" &&
    typeof value["resource"] === "string" &&
    Array.isArray(value["scopes"]);
}

export function normalizeApprovalRecord(record: ApprovalRecord) {
  return {
    ...record,
    scopes: normalizeScopes(record.scopes),
  };
}

function isOAuthClientInformationFull(value: unknown): value is OAuthClientInformationFull {
  return isRecord(value) && typeof value["client_id"] === "string";
}

function isOAuthGrantUpstreamTokens(value: unknown): value is OAuthGrantUpstreamTokens {
  return isRecord(value) &&
    typeof value["token_type"] === "string";
}

function isAuthorizationCodeStep(value: unknown): value is NonNullable<OAuthGrant["authorizationCode"]> {
  return isRecord(value) &&
    typeof value["code"] === "string" &&
    typeof value["expiresAt"] === "number";
}

function isConsentStep(value: unknown): value is NonNullable<OAuthGrant["consent"]> {
  return isRecord(value) &&
    typeof value["challenge"] === "string" &&
    typeof value["expiresAt"] === "number";
}

function isPendingAuthorizationStep(value: unknown): value is NonNullable<OAuthGrant["pendingAuthorization"]> {
  return isRecord(value) &&
    typeof value["expiresAt"] === "number" &&
    typeof value["stateId"] === "string";
}

function isRefreshTokenStep(value: unknown): value is NonNullable<OAuthGrant["refreshToken"]> {
  return isRecord(value) &&
    typeof value["expiresAt"] === "number" &&
    typeof value["token"] === "string";
}

function fromRecordEntries<T>(entries: Iterable<readonly [string, T]>): Record<string, T> {
  const record: Record<string, T> = {};

  for (const [key, value] of entries) {
    record[key] = value;
  }

  return record;
}

function createEmptyState(): PersistedOAuthState {
  return {
    approvals: [],
    clients: {},
    clientProfiles: {},
    grants: {},
    version: 2,
  };
}

function parseApprovals(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isApprovalRecord)
    .map(normalizeApprovalRecord);
}

function parseClients(value: unknown): Record<string, OAuthClientInformationFull> {
  if (!isRecord(value)) {
    return {};
  }

  return fromRecordEntries(
    Object.entries(value).filter(
      (entry): entry is [string, OAuthClientInformationFull] => isOAuthClientInformationFull(entry[1]),
    ),
  );
}

function parseClientProfiles(value: unknown): Record<string, ClientProfileId> {
  if (!isRecord(value)) {
    return {};
  }

  return fromRecordEntries(
    Object.entries(value).filter((entry): entry is [string, ClientProfileId] => (
      entry[1] === "chatgpt" ||
      entry[1] === "claude" ||
      entry[1] === "codex" ||
      entry[1] === "generic"
    )),
  );
}

function parseCompatibilityProfileId(value: unknown): ClientProfileId | undefined {
  return value === "chatgpt" ||
    value === "claude" ||
    value === "codex" ||
    value === "generic"
    ? value
    : undefined;
}

type ParsedGrantRequiredFields = {
  clientId: string;
  codeChallenge: string;
  grantId: string;
  redirectUri: string;
  resource: string;
  scopes: string[];
};

function parseGrantRequiredFields(value: Record<string, unknown>): ParsedGrantRequiredFields | undefined {
  const grantId = value["grantId"];
  const clientId = value["clientId"];
  const codeChallenge = value["codeChallenge"];
  const redirectUri = value["redirectUri"];
  const resource = value["resource"];
  const scopes = value["scopes"];

  if (
    typeof grantId !== "string" ||
    typeof clientId !== "string" ||
    typeof codeChallenge !== "string" ||
    typeof redirectUri !== "string" ||
    typeof resource !== "string" ||
    !Array.isArray(scopes)
  ) {
    return undefined;
  }

  return {
    clientId,
    codeChallenge,
    grantId,
    redirectUri,
    resource,
    scopes: scopes.filter((scope): scope is string => typeof scope === "string"),
  };
}

function buildOptionalGrantFields(value: Record<string, unknown>): Partial<OAuthGrant> {
  const compatibilityProfileId = parseCompatibilityProfileId(value["compatibilityProfileId"]);

  return {
    ...(isAuthorizationCodeStep(value["authorizationCode"]) ? { authorizationCode: value["authorizationCode"] } : {}),
    ...(typeof value["clientName"] === "string" ? { clientName: value["clientName"] } : {}),
    ...(compatibilityProfileId ? { compatibilityProfileId } : {}),
    ...(isConsentStep(value["consent"]) ? { consent: value["consent"] } : {}),
    ...(isPendingAuthorizationStep(value["pendingAuthorization"]) ? { pendingAuthorization: value["pendingAuthorization"] } : {}),
    ...(isRefreshTokenStep(value["refreshToken"]) ? { refreshToken: value["refreshToken"] } : {}),
    ...(typeof value["state"] === "string" ? { state: value["state"] } : {}),
    ...(typeof value["principalId"] === "string" ? { principalId: value["principalId"] } : {}),
    ...(isOAuthGrantUpstreamTokens(value["upstreamTokens"]) ? { upstreamTokens: value["upstreamTokens"] } : {}),
  };
}

function parseGrantRecord(value: unknown): OAuthGrant | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const requiredFields = parseGrantRequiredFields(value);

  if (!requiredFields) {
    return undefined;
  }

  return normalizeGrant({
    ...buildOptionalGrantFields(value),
    clientId: requiredFields.clientId,
    codeChallenge: requiredFields.codeChallenge,
    grantId: requiredFields.grantId,
    redirectUri: requiredFields.redirectUri,
    resource: requiredFields.resource,
    scopes: requiredFields.scopes,
  });
}

function parseGrants(value: unknown): Record<string, OAuthGrant> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return fromRecordEntries(
    Object.entries(value)
      .map(([grantId, record]) => {
        const parsed = parseGrantRecord(record);

        if (!parsed) {
          return undefined;
        }

        return [grantId, {
          ...parsed,
          grantId,
        }] as const;
      })
      .filter((entry): entry is readonly [string, OAuthGrant] => entry !== undefined),
  );
}

export function loadPersistedOAuthState(parsed: unknown): PersistedOAuthState {
  if (!isRecord(parsed)) {
    return createEmptyState();
  }

  if (parsed["version"] === 2 || parsed["grants"] !== undefined) {
    return {
      approvals: parseApprovals(parsed["approvals"]),
      clients: parseClients(parsed["clients"]),
      clientProfiles: parseClientProfiles(parsed["clientProfiles"]),
      grants: parseGrants(parsed["grants"]),
      version: 2,
    };
  }

  return createEmptyState();
}

export function deserializePersistedOAuthState(serialized: string): PersistedOAuthState {
  return loadPersistedOAuthState(JSON.parse(serialized));
}
