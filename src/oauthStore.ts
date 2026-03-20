import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

import {
  getGrantExpiry,
  hasActiveGrantStep,
  normalizeGrant,
  normalizeScopes,
  type OAuthGrant,
  type OAuthGrantInput,
} from "./oauthGrant.js";

type ApprovalRecord = {
  clientId: string;
  resource: string;
  scopes: string[];
};

type PendingConsentRecord = {
  clientId: string;
  clientName?: string | undefined;
  codeChallenge: string;
  expiresAt: number;
  redirectUri: string;
  resource: string;
  scopes: string[];
  state?: string | undefined;
};

type PendingAuthorizationRecord = Omit<PendingConsentRecord, "clientName">;

type AuthorizationCodeRecord = PendingAuthorizationRecord & {
  principalId: string;
  upstreamTokens: OAuthTokens;
};

type RefreshTokenRecord = {
  clientId: string;
  expiresAt: number;
  principalId: string;
  resource: string;
  scopes: string[];
  upstreamTokens: OAuthTokens;
};

type LegacyPersistedOAuthState = {
  approvals?: unknown;
  authorizationCodes?: unknown;
  clients?: unknown;
  pendingAuthorizations?: unknown;
  pendingConsents?: unknown;
  refreshTokens?: unknown;
  version?: number | undefined;
};

type PersistedOAuthState = {
  approvals: ApprovalRecord[];
  clients: Record<string, OAuthClientInformationFull>;
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

function normalizeApprovalRecord(record: ApprovalRecord) {
  return {
    ...record,
    scopes: normalizeScopes(record.scopes),
  };
}

function isOAuthTokens(value: unknown): value is OAuthTokens {
  return isRecord(value) &&
    typeof value["access_token"] === "string" &&
    typeof value["token_type"] === "string";
}

function isOAuthClientInformationFull(value: unknown): value is OAuthClientInformationFull {
  return isRecord(value) && typeof value["client_id"] === "string";
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

function fromRecordEntries<T>(entries: Iterable<readonly [string, T]>): Record<string, T> {
  const record: Record<string, T> = {};

  for (const [key, value] of entries) {
    record[key] = value;
  }

  return record;
}

function isRefreshTokenStep(value: unknown): value is NonNullable<OAuthGrant["refreshToken"]> {
  return isRecord(value) &&
    typeof value["expiresAt"] === "number" &&
    typeof value["token"] === "string";
}

function createEmptyState(): PersistedOAuthState {
  return {
    approvals: [],
    clients: {},
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

// This legacy persistence parser intentionally validates several optional grant steps in one place.
// eslint-disable-next-line sonarjs/cognitive-complexity
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
    ...(typeof value["subject"] === "string" ? { subject: value["subject"] } : {}),
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

function toLegacyPendingConsentGrant(
  consentId: string,
  record: unknown,
): OAuthGrantInput | undefined {
  if (!isRecord(record)) {
    return undefined;
  }

  const clientId = record["clientId"];
  const codeChallenge = record["codeChallenge"];
  const expiresAt = record["expiresAt"];
  const redirectUri = record["redirectUri"];
  const resource = record["resource"];
  const scopes = record["scopes"];

  if (
    typeof clientId !== "string" ||
    typeof codeChallenge !== "string" ||
    typeof expiresAt !== "number" ||
    typeof redirectUri !== "string" ||
    typeof resource !== "string" ||
    !Array.isArray(scopes)
  ) {
    return undefined;
  }

  return {
    clientId,
    ...(typeof record["clientName"] === "string" ? { clientName: record["clientName"] } : {}),
    codeChallenge,
    consent: {
      challenge: consentId,
      expiresAt,
    },
    grantId: `legacy-consent:${consentId}`,
    redirectUri,
    resource,
    scopes: scopes.filter((scope): scope is string => typeof scope === "string"),
    ...(typeof record["state"] === "string" ? { state: record["state"] } : {}),
  };
}

function toLegacyPendingAuthorizationGrant(
  stateId: string,
  record: unknown,
): OAuthGrantInput | undefined {
  if (!isRecord(record)) {
    return undefined;
  }

  const clientId = record["clientId"];
  const codeChallenge = record["codeChallenge"];
  const expiresAt = record["expiresAt"];
  const redirectUri = record["redirectUri"];
  const resource = record["resource"];
  const scopes = record["scopes"];

  if (
    typeof clientId !== "string" ||
    typeof codeChallenge !== "string" ||
    typeof expiresAt !== "number" ||
    typeof redirectUri !== "string" ||
    typeof resource !== "string" ||
    !Array.isArray(scopes)
  ) {
    return undefined;
  }

  return {
    clientId,
    codeChallenge,
    grantId: `legacy-authorization:${stateId}`,
    pendingAuthorization: {
      expiresAt,
      stateId,
    },
    redirectUri,
    resource,
    scopes: scopes.filter((scope): scope is string => typeof scope === "string"),
    ...(typeof record["state"] === "string" ? { state: record["state"] } : {}),
  };
}

function migrateLegacyGrantRecords(
  records: unknown,
  toGrant: (recordId: string, record: unknown) => OAuthGrantInput | undefined,
  pushGrant: (grant: OAuthGrantInput) => void,
): void {
  if (!records || typeof records !== "object") {
    return;
  }

  for (const [recordId, record] of Object.entries(records)) {
    const grant = toGrant(recordId, record);

    if (grant) {
      pushGrant(grant);
    }
  }
}

function toLegacyAuthorizationCodeGrant(
  code: string,
  record: unknown,
): OAuthGrantInput | undefined {
  if (!isRecord(record)) {
    return undefined;
  }

  const clientId = record["clientId"];
  const codeChallenge = record["codeChallenge"];
  const expiresAt = record["expiresAt"];
  const redirectUri = record["redirectUri"];
  const resource = record["resource"];
  const scopes = record["scopes"];
  const principalId = typeof record["principalId"] === "string"
    ? record["principalId"]
    : typeof record["subject"] === "string"
      ? record["subject"]
      : undefined;
  const upstreamTokens = record["upstreamTokens"];

  if (
    typeof clientId !== "string" ||
    typeof codeChallenge !== "string" ||
    typeof expiresAt !== "number" ||
    typeof redirectUri !== "string" ||
    typeof resource !== "string" ||
    !Array.isArray(scopes) ||
    typeof principalId !== "string" ||
    !isOAuthTokens(upstreamTokens)
  ) {
    return undefined;
  }

  return {
    authorizationCode: {
      code,
      expiresAt,
    },
    clientId,
    codeChallenge,
    grantId: `legacy-code:${code}`,
    redirectUri,
    resource,
    scopes: scopes.filter((scope): scope is string => typeof scope === "string"),
    ...(typeof record["state"] === "string" ? { state: record["state"] } : {}),
    principalId,
    upstreamTokens,
  };
}

function toLegacyRefreshTokenGrant(
  token: string,
  record: unknown,
): OAuthGrantInput | undefined {
  if (!isRecord(record)) {
    return undefined;
  }

  const clientId = record["clientId"];
  const expiresAt = record["expiresAt"];
  const resource = record["resource"];
  const scopes = record["scopes"];
  const principalId = typeof record["principalId"] === "string"
    ? record["principalId"]
    : typeof record["subject"] === "string"
      ? record["subject"]
      : undefined;
  const upstreamTokens = record["upstreamTokens"];

  if (
    typeof clientId !== "string" ||
    typeof expiresAt !== "number" ||
    typeof resource !== "string" ||
    !Array.isArray(scopes) ||
    typeof principalId !== "string" ||
    !isOAuthTokens(upstreamTokens)
  ) {
    return undefined;
  }

  return {
    clientId,
    codeChallenge: "",
    grantId: `legacy-refresh:${token}`,
    redirectUri: "",
    refreshToken: {
      expiresAt,
      token,
    },
    resource,
    scopes: scopes.filter((scope): scope is string => typeof scope === "string"),
    principalId,
    upstreamTokens,
  };
}

function migrateLegacyState(parsed: LegacyPersistedOAuthState): PersistedOAuthState {
  const grants: Record<string, OAuthGrant> = {};

  const pushGrant = (grant: OAuthGrantInput) => {
    grants[grant.grantId] = normalizeGrant(grant);
  };

  migrateLegacyGrantRecords(parsed.pendingConsents, toLegacyPendingConsentGrant, pushGrant);
  migrateLegacyGrantRecords(parsed.pendingAuthorizations, toLegacyPendingAuthorizationGrant, pushGrant);
  migrateLegacyGrantRecords(parsed.authorizationCodes, toLegacyAuthorizationCodeGrant, pushGrant);
  migrateLegacyGrantRecords(parsed.refreshTokens, toLegacyRefreshTokenGrant, pushGrant);

  return {
    approvals: parseApprovals(parsed.approvals),
    clients: parseClients(parsed.clients),
    grants,
    version: 2,
  };
}

function pruneExpiredEntries(state: PersistedOAuthState) {
  const now = Date.now();

  return {
    ...state,
    grants: Object.fromEntries(
      Object.entries(state.grants)
        .map(([grantId, grant]) => [grantId, normalizeGrant(grant)] as const)
        .filter(([, grant]) => {
          if (!hasActiveGrantStep(grant)) {
            return false;
          }

          const expiresAt = getGrantExpiry(grant);
          return expiresAt === undefined || expiresAt > now;
        }),
    ),
  };
}

function loadState(storePath: string | undefined): PersistedOAuthState {
  if (!storePath) {
    return createEmptyState();
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(storePath, "utf8"));

    if (!isRecord(parsed)) {
      return createEmptyState();
    }

    if (parsed["version"] === 2 || parsed["grants"] !== undefined) {
      return {
        approvals: parseApprovals(parsed["approvals"]),
        clients: parseClients(parsed["clients"]),
        grants: parseGrants(parsed["grants"]),
        version: 2,
      };
    }

    return migrateLegacyState({
      approvals: parsed["approvals"],
      authorizationCodes: parsed["authorizationCodes"],
      clients: parsed["clients"],
      pendingAuthorizations: parsed["pendingAuthorizations"],
      pendingConsents: parsed["pendingConsents"],
      refreshTokens: parsed["refreshTokens"],
      ...(typeof parsed["version"] === "number" ? { version: parsed["version"] } : {}),
    });
  } catch (error) {
    if (isRecord(error) && error["code"] === "ENOENT") {
      return createEmptyState();
    }

    throw error;
  }
}

function toPendingConsentRecord(grant: OAuthGrant): PendingConsentRecord | undefined {
  if (!grant.consent) {
    return undefined;
  }

  return {
    clientId: grant.clientId,
    clientName: grant.clientName,
    codeChallenge: grant.codeChallenge,
    expiresAt: grant.consent.expiresAt,
    redirectUri: grant.redirectUri,
    resource: grant.resource,
    scopes: grant.scopes,
    state: grant.state,
  };
}

function toPendingAuthorizationRecord(grant: OAuthGrant): PendingAuthorizationRecord | undefined {
  if (!grant.pendingAuthorization) {
    return undefined;
  }

  return {
    clientId: grant.clientId,
    codeChallenge: grant.codeChallenge,
    expiresAt: grant.pendingAuthorization.expiresAt,
    redirectUri: grant.redirectUri,
    resource: grant.resource,
    scopes: grant.scopes,
    state: grant.state,
  };
}

function toAuthorizationCodeRecord(grant: OAuthGrant): AuthorizationCodeRecord | undefined {
  if (!grant.authorizationCode || !grant.principalId || !grant.upstreamTokens) {
    return undefined;
  }

  return {
    clientId: grant.clientId,
    codeChallenge: grant.codeChallenge,
    expiresAt: grant.authorizationCode.expiresAt,
    redirectUri: grant.redirectUri,
    resource: grant.resource,
    scopes: grant.scopes,
    state: grant.state,
    principalId: grant.principalId,
    upstreamTokens: grant.upstreamTokens,
  };
}

function toRefreshTokenRecord(grant: OAuthGrant): RefreshTokenRecord | undefined {
  if (!grant.refreshToken || !grant.principalId || !grant.upstreamTokens) {
    return undefined;
  }

  return {
    clientId: grant.clientId,
    expiresAt: grant.refreshToken.expiresAt,
    resource: grant.resource,
    scopes: grant.scopes,
    principalId: grant.principalId,
    upstreamTokens: grant.upstreamTokens,
  };
}

export function createOAuthStore(storePath: string | undefined) {
  let state = pruneExpiredEntries(loadState(storePath));

  function persist() {
    if (!storePath) {
      return;
    }

    mkdirSync(path.dirname(storePath), { recursive: true });
    const tempPath = `${storePath}.${process.pid}.tmp`;
    writeFileSync(tempPath, JSON.stringify(state, null, 2));
    renameSync(tempPath, storePath);
  }

  function deleteGrant(grantId: string) {
    if (!(grantId in state.grants)) {
      return;
    }

    const grants = { ...state.grants };
    delete grants[grantId];
    state = {
      ...state,
      grants,
    };
    persist();
  }

  function findGrant(matcher: (grant: OAuthGrant) => boolean) {
    for (const [grantId, grant] of Object.entries(state.grants)) {
      if (!matcher(grant)) {
        continue;
      }

      const expiresAt = getGrantExpiry(grant);

      if (expiresAt !== undefined && expiresAt <= Date.now()) {
        deleteGrant(grantId);
        return undefined;
      }

      return grant;
    }

    return undefined;
  }

  if (storePath) {
    persist();
  }

  return {
    approveClient(record: ApprovalRecord) {
      const normalizedRecord = normalizeApprovalRecord(record);

      if (!state.approvals.some((approval) => (
        approval.clientId === normalizedRecord.clientId &&
        approval.resource === normalizedRecord.resource &&
        approval.scopes.join(" ") === normalizedRecord.scopes.join(" ")
      ))) {
        state = {
          ...state,
          approvals: [...state.approvals, normalizedRecord],
        };
        persist();
      }
    },
    deleteAuthorizationCode(code: string) {
      const grant = findGrant((candidate) => candidate.authorizationCode?.code === code);

      if (grant) {
        deleteGrant(grant.grantId);
      }
    },
    deleteGrant,
    deletePendingAuthorization(stateId: string) {
      const grant = findGrant((candidate) => candidate.pendingAuthorization?.stateId === stateId);

      if (grant) {
        deleteGrant(grant.grantId);
      }
    },
    deletePendingConsent(consentId: string) {
      const grant = findGrant((candidate) => candidate.consent?.challenge === consentId);

      if (grant) {
        deleteGrant(grant.grantId);
      }
    },
    deleteRefreshToken(refreshToken: string) {
      const grant = findGrant((candidate) => candidate.refreshToken?.token === refreshToken);

      if (grant) {
        deleteGrant(grant.grantId);
      }
    },
    getAuthorizationCode(code: string) {
      const grant = findGrant((candidate) => candidate.authorizationCode?.code === code);
      return grant ? toAuthorizationCodeRecord(grant) : undefined;
    },
    getAuthorizationCodeGrant(code: string) {
      return findGrant((candidate) => candidate.authorizationCode?.code === code);
    },
    getClient(clientId: string) {
      return state.clients[clientId];
    },
    getGrant(grantId: string) {
      const grant = state.grants[grantId];

      if (!grant) {
        return undefined;
      }

      const expiresAt = getGrantExpiry(grant);

      if (expiresAt !== undefined && expiresAt <= Date.now()) {
        deleteGrant(grantId);
        return undefined;
      }

      return grant;
    },
    getPendingAuthorization(stateId: string) {
      const grant = findGrant((candidate) => candidate.pendingAuthorization?.stateId === stateId);
      return grant ? toPendingAuthorizationRecord(grant) : undefined;
    },
    getPendingAuthorizationGrant(stateId: string) {
      return findGrant((candidate) => candidate.pendingAuthorization?.stateId === stateId);
    },
    getPendingConsent(consentId: string) {
      const grant = findGrant((candidate) => candidate.consent?.challenge === consentId);
      return grant ? toPendingConsentRecord(grant) : undefined;
    },
    getPendingConsentGrant(consentId: string) {
      return findGrant((candidate) => candidate.consent?.challenge === consentId);
    },
    getRefreshToken(refreshToken: string) {
      const grant = findGrant((candidate) => candidate.refreshToken?.token === refreshToken);
      return grant ? toRefreshTokenRecord(grant) : undefined;
    },
    getRefreshTokenGrant(refreshToken: string) {
      return findGrant((candidate) => candidate.refreshToken?.token === refreshToken);
    },
    isClientApproved(record: ApprovalRecord) {
      const normalizedScopes = normalizeScopes(record.scopes);

      return state.approvals.some((approval) => (
        approval.clientId === record.clientId &&
        approval.resource === record.resource &&
        approval.scopes.join(" ") === normalizedScopes.join(" ")
      ));
    },
    saveAuthorizationCode(code: string, record: AuthorizationCodeRecord) {
      state = {
        ...state,
        grants: {
          ...state.grants,
          [`compat-code:${code}`]: normalizeGrant({
            authorizationCode: {
              code,
              expiresAt: record.expiresAt,
            },
            clientId: record.clientId,
            codeChallenge: record.codeChallenge,
            grantId: `compat-code:${code}`,
            redirectUri: record.redirectUri,
            resource: record.resource,
            scopes: record.scopes,
            state: record.state,
            principalId: record.principalId,
            upstreamTokens: record.upstreamTokens,
          }),
        },
      };
      persist();
    },
    saveClient(client: OAuthClientInformationFull) {
      state = {
        ...state,
        clients: {
          ...state.clients,
          [client.client_id]: client,
        },
      };
      persist();
    },
    saveGrant(grant: OAuthGrantInput) {
      state = {
        ...state,
        grants: {
          ...state.grants,
          [grant.grantId]: normalizeGrant(grant),
        },
      };
      persist();
    },
    savePendingAuthorization(stateId: string, record: PendingAuthorizationRecord) {
      state = {
        ...state,
        grants: {
          ...state.grants,
          [`compat-authorization:${stateId}`]: normalizeGrant({
            clientId: record.clientId,
            codeChallenge: record.codeChallenge,
            grantId: `compat-authorization:${stateId}`,
            pendingAuthorization: {
              expiresAt: record.expiresAt,
              stateId,
            },
            redirectUri: record.redirectUri,
            resource: record.resource,
            scopes: record.scopes,
            state: record.state,
          }),
        },
      };
      persist();
    },
    savePendingConsent(consentId: string, record: PendingConsentRecord) {
      state = {
        ...state,
        grants: {
          ...state.grants,
          [`compat-consent:${consentId}`]: normalizeGrant({
            clientId: record.clientId,
            clientName: record.clientName,
            codeChallenge: record.codeChallenge,
            consent: {
              challenge: consentId,
              expiresAt: record.expiresAt,
            },
            grantId: `compat-consent:${consentId}`,
            redirectUri: record.redirectUri,
            resource: record.resource,
            scopes: record.scopes,
            state: record.state,
          }),
        },
      };
      persist();
    },
    saveRefreshToken(refreshToken: string, record: RefreshTokenRecord) {
      state = {
        ...state,
        grants: {
          ...state.grants,
          [`compat-refresh:${refreshToken}`]: normalizeGrant({
            clientId: record.clientId,
            codeChallenge: "",
            grantId: `compat-refresh:${refreshToken}`,
            redirectUri: "",
            refreshToken: {
              expiresAt: record.expiresAt,
              token: refreshToken,
            },
            resource: record.resource,
            scopes: record.scopes,
            principalId: record.principalId,
            upstreamTokens: record.upstreamTokens,
          }),
        },
      };
      persist();
    },
  };
}
