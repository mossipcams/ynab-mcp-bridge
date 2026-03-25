import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

import type { ClientProfileId } from "./clientProfiles/types.js";
import {
  normalizeGrant,
  normalizeScopes,
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

function isOAuthTokens(value: unknown): value is OAuthTokens {
  return isRecord(value) &&
    typeof value["access_token"] === "string" &&
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

function parseGrantRecord(value: unknown): OAuthGrant | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

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

  return normalizeGrant({
    ...(isAuthorizationCodeStep(value["authorizationCode"]) ? { authorizationCode: value["authorizationCode"] } : {}),
    clientId,
    ...(typeof value["clientName"] === "string" ? { clientName: value["clientName"] } : {}),
    ...(value["compatibilityProfileId"] === "chatgpt" ||
        value["compatibilityProfileId"] === "claude" ||
        value["compatibilityProfileId"] === "codex" ||
        value["compatibilityProfileId"] === "generic"
      ? { compatibilityProfileId: value["compatibilityProfileId"] }
      : {}),
    codeChallenge,
    ...(isConsentStep(value["consent"]) ? { consent: value["consent"] } : {}),
    grantId,
    ...(isPendingAuthorizationStep(value["pendingAuthorization"]) ? { pendingAuthorization: value["pendingAuthorization"] } : {}),
    redirectUri,
    ...(isRefreshTokenStep(value["refreshToken"]) ? { refreshToken: value["refreshToken"] } : {}),
    resource,
    scopes: scopes.filter((scope): scope is string => typeof scope === "string"),
    ...(typeof value["state"] === "string" ? { state: value["state"] } : {}),
    ...(typeof value["principalId"] === "string" ? { principalId: value["principalId"] } : {}),
    ...(isOAuthTokens(value["upstreamTokens"]) ? { upstreamTokens: value["upstreamTokens"] } : {}),
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
  return loadPersistedOAuthState(JSON.parse(serialized) as unknown);
}
