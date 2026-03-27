/**
 * Owns: persisted approvals/clients/client-profiles/grants state, legacy migration, pruning, and atomic file persistence.
 * Inputs/dependencies: store path plus grant normalization helpers.
 * Outputs/contracts: createOAuthStore(...) and the persistence contract consumed by grant lifecycle and the OAuth runtime.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

import type { ClientProfileId } from "./clientProfiles/types.js";
import {
  getGrantExpiry,
  hasActiveGrantStep,
  normalizeGrant,
  normalizeScopes,
  type OAuthGrant,
  type OAuthGrantInput,
  type OAuthGrantUpstreamTokens,
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
  upstreamTokens: OAuthGrantUpstreamTokens;
};

type RefreshTokenRecord = {
  clientId: string;
  expiresAt: number;
  principalId: string;
  resource: string;
  scopes: string[];
  upstreamTokens: OAuthGrantUpstreamTokens;
};

type LegacyPersistedOAuthState = {
  approvals?: unknown;
  authorizationCodes?: unknown;
  clients?: unknown;
  pendingAuthorizations?: unknown;
  pendingConsents?: unknown;
  refreshTokens?: unknown;
  version?: number;
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

function normalizeApprovalRecord(record: ApprovalRecord) {
  return {
    ...record,
    scopes: normalizeScopes(record.scopes),
  };
}

function isOAuthClientInformationFull(value: unknown): value is OAuthClientInformationFull {
  return isRecord(value) && typeof value["client_id"] === "string";
}

function isOAuthGrantUpstreamTokens(value: unknown): value is OAuthGrantUpstreamTokens {
  return isRecord(value) && typeof value["token_type"] === "string";
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

function getLegacyPrincipalId(record: Record<string, unknown>): string | undefined {
  const principalId = record["principalId"] ?? record["subject"];
  return typeof principalId === "string" ? principalId : undefined;
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

function parseClients(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return fromRecordEntries(
    Object.entries(value).filter(
      (entry): entry is [string, OAuthClientInformationFull] => isOAuthClientInformationFull(entry[1]),
    ),
  );
}

function parseClientProfiles(value: unknown) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, ClientProfileId] => (
        typeof entry[0] === "string" &&
        (entry[1] === "chatgpt" || entry[1] === "claude" || entry[1] === "codex" || entry[1] === "generic")
      )),
  );
}

function parseGrantRecord(value: unknown): OAuthGrant | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    typeof value["grantId"] !== "string" ||
    typeof value["clientId"] !== "string" ||
    typeof value["codeChallenge"] !== "string" ||
    typeof value["redirectUri"] !== "string" ||
    typeof value["resource"] !== "string" ||
    !Array.isArray(value["scopes"])
  ) {
    return undefined;
  }

  return normalizeGrant({
    ...(typeof value["clientName"] === "string" ? { clientName: value["clientName"] } : {}),
    ...(
      value["compatibilityProfileId"] === "chatgpt" ||
      value["compatibilityProfileId"] === "claude" ||
      value["compatibilityProfileId"] === "codex" ||
      value["compatibilityProfileId"] === "generic"
        ? { compatibilityProfileId: value["compatibilityProfileId"] }
        : {}
    ),
    ...(isAuthorizationCodeStep(value["authorizationCode"]) ? { authorizationCode: value["authorizationCode"] } : {}),
    ...(isConsentStep(value["consent"]) ? { consent: value["consent"] } : {}),
    ...(isPendingAuthorizationStep(value["pendingAuthorization"]) ? { pendingAuthorization: value["pendingAuthorization"] } : {}),
    ...(isRefreshTokenStep(value["refreshToken"]) ? { refreshToken: value["refreshToken"] } : {}),
    ...(typeof value["state"] === "string" ? { state: value["state"] } : {}),
    ...(typeof value["principalId"] === "string" ? { principalId: value["principalId"] } : {}),
    ...(typeof value["subject"] === "string" ? { subject: value["subject"] } : {}),
    ...(isOAuthGrantUpstreamTokens(value["upstreamTokens"]) ? { upstreamTokens: value["upstreamTokens"] } : {}),
    clientId: value["clientId"],
    codeChallenge: value["codeChallenge"],
    grantId: value["grantId"],
    redirectUri: value["redirectUri"],
    resource: value["resource"],
    scopes: value["scopes"].filter((scope): scope is string => typeof scope === "string"),
  });
}

function parseGrants(value: unknown) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
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

function migrateLegacyState(parsed: LegacyPersistedOAuthState): PersistedOAuthState {
  const grants: Record<string, OAuthGrant> = {};

  const pushGrant = (grant: OAuthGrantInput) => {
    grants[grant.grantId] = normalizeGrant(grant);
  };

  if (parsed.pendingConsents && typeof parsed.pendingConsents === "object") {
    for (const [consentId, record] of Object.entries(parsed.pendingConsents)) {
      if (!isRecord(record)) {
        continue;
      }

      if (
        typeof record["clientId"] === "string" &&
        typeof record["codeChallenge"] === "string" &&
        typeof record["expiresAt"] === "number" &&
        typeof record["redirectUri"] === "string" &&
        typeof record["resource"] === "string" &&
        Array.isArray(record["scopes"])
      ) {
        pushGrant({
          clientId: record["clientId"],
          ...(typeof record["clientName"] === "string" ? { clientName: record["clientName"] } : {}),
          codeChallenge: record["codeChallenge"],
          consent: {
            challenge: consentId,
            expiresAt: record["expiresAt"],
          },
          grantId: `legacy-consent:${consentId}`,
          redirectUri: record["redirectUri"],
          resource: record["resource"],
          scopes: record["scopes"].filter((scope): scope is string => typeof scope === "string"),
          ...(typeof record["state"] === "string" ? { state: record["state"] } : {}),
        });
      }
    }
  }

  if (parsed.pendingAuthorizations && typeof parsed.pendingAuthorizations === "object") {
    for (const [stateId, record] of Object.entries(parsed.pendingAuthorizations)) {
      if (!isRecord(record)) {
        continue;
      }

      if (
        typeof record["clientId"] === "string" &&
        typeof record["codeChallenge"] === "string" &&
        typeof record["expiresAt"] === "number" &&
        typeof record["redirectUri"] === "string" &&
        typeof record["resource"] === "string" &&
        Array.isArray(record["scopes"])
      ) {
        pushGrant({
          clientId: record["clientId"],
          codeChallenge: record["codeChallenge"],
          grantId: `legacy-authorization:${stateId}`,
          pendingAuthorization: {
            expiresAt: record["expiresAt"],
            stateId,
          },
          redirectUri: record["redirectUri"],
          resource: record["resource"],
          scopes: record["scopes"].filter((scope): scope is string => typeof scope === "string"),
          ...(typeof record["state"] === "string" ? { state: record["state"] } : {}),
        });
      }
    }
  }

  if (parsed.authorizationCodes && typeof parsed.authorizationCodes === "object") {
    for (const [code, record] of Object.entries(parsed.authorizationCodes)) {
      if (!isRecord(record)) {
        continue;
      }

      if (
        typeof record["clientId"] === "string" &&
        typeof record["codeChallenge"] === "string" &&
        typeof record["expiresAt"] === "number" &&
        typeof record["redirectUri"] === "string" &&
        typeof record["resource"] === "string" &&
        Array.isArray(record["scopes"]) &&
        typeof getLegacyPrincipalId(record) === "string" &&
        isOAuthGrantUpstreamTokens(record["upstreamTokens"])
      ) {
        const principalId = getLegacyPrincipalId(record);

        if (!principalId) {
          continue;
        }

        pushGrant({
          authorizationCode: {
            code,
            expiresAt: record["expiresAt"],
          },
          clientId: record["clientId"],
          codeChallenge: record["codeChallenge"],
          grantId: `legacy-code:${code}`,
          redirectUri: record["redirectUri"],
          resource: record["resource"],
          scopes: record["scopes"].filter((scope): scope is string => typeof scope === "string"),
          ...(typeof record["state"] === "string" ? { state: record["state"] } : {}),
          principalId,
          upstreamTokens: record["upstreamTokens"],
        });
      }
    }
  }

  if (parsed.refreshTokens && typeof parsed.refreshTokens === "object") {
    for (const [token, record] of Object.entries(parsed.refreshTokens)) {
      if (!isRecord(record)) {
        continue;
      }

      if (
        typeof record["clientId"] === "string" &&
        typeof record["expiresAt"] === "number" &&
        typeof record["resource"] === "string" &&
        Array.isArray(record["scopes"]) &&
        typeof getLegacyPrincipalId(record) === "string" &&
        isOAuthGrantUpstreamTokens(record["upstreamTokens"])
      ) {
        const principalId = getLegacyPrincipalId(record);

        if (!principalId) {
          continue;
        }

        pushGrant({
          clientId: record["clientId"],
          codeChallenge: "",
          grantId: `legacy-refresh:${token}`,
          redirectUri: "",
          refreshToken: {
            expiresAt: record["expiresAt"],
            token,
          },
          resource: record["resource"],
          scopes: record["scopes"].filter((scope): scope is string => typeof scope === "string"),
          principalId,
          upstreamTokens: record["upstreamTokens"],
        });
      }
    }
  }

  return {
    approvals: parseApprovals(parsed.approvals),
    clients: parseClients(parsed.clients),
    clientProfiles: {},
    grants,
    version: 2,
  };
}

function pruneExpiredEntries(state: PersistedOAuthState) {
  const now = Date.now();

  return {
    ...state,
    grants: fromRecordEntries(
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

export function loadPersistedOAuthState(parsed: unknown): PersistedOAuthState {
  if (isRecord(parsed) && (parsed["version"] === 2 || parsed["grants"] !== undefined)) {
    return {
      approvals: parseApprovals(parsed["approvals"]),
      clients: parseClients(parsed["clients"]),
      clientProfiles: parseClientProfiles(parsed["clientProfiles"]),
      grants: parseGrants(parsed["grants"]),
      version: 2,
    };
  }

  return migrateLegacyState(isRecord(parsed) ? parsed : {});
}

export function deserializePersistedOAuthState(serialized: string): PersistedOAuthState {
  return loadPersistedOAuthState(JSON.parse(serialized));
}

function loadState(storePath: string | undefined): PersistedOAuthState {
  if (!storePath) {
    return createEmptyState();
  }

  try {
    return deserializePersistedOAuthState(readFileSync(storePath, "utf8"));
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return createEmptyState();
    }

    throw error;
  }
}

export function toPendingConsentRecord(grant: OAuthGrant): PendingConsentRecord | undefined {
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

export function toPendingAuthorizationRecord(grant: OAuthGrant): PendingAuthorizationRecord | undefined {
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

export function toAuthorizationCodeRecord(grant: OAuthGrant): AuthorizationCodeRecord | undefined {
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

export function toRefreshTokenRecord(grant: OAuthGrant): RefreshTokenRecord | undefined {
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

function sanitizePersistedUpstreamTokens(tokens: OAuthGrantUpstreamTokens | undefined) {
  if (!tokens) {
    return tokens;
  }

  if (typeof tokens.refresh_token !== "string" || tokens.refresh_token.length === 0) {
    return tokens;
  }

  const { access_token: _accessToken, ...persistedTokens } = tokens;
  return persistedTokens;
}

export function createAuthorizationCodeCompatibilityGrant(
  code: string,
  record: AuthorizationCodeRecord,
): OAuthGrant {
  return normalizeGrant({
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
  });
}

export function createPendingAuthorizationCompatibilityGrant(
  stateId: string,
  record: PendingAuthorizationRecord,
): OAuthGrant {
  return normalizeGrant({
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
  });
}

export function createPendingConsentCompatibilityGrant(
  consentId: string,
  record: PendingConsentRecord,
): OAuthGrant {
  return normalizeGrant({
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
  });
}

export function createRefreshTokenCompatibilityGrant(
  refreshToken: string,
  record: RefreshTokenRecord,
): OAuthGrant {
  return normalizeGrant({
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
  });
}

function createPersistedStateSnapshot(state: PersistedOAuthState): PersistedOAuthState {
  return {
    ...state,
    grants: Object.fromEntries(
      Object.entries(state.grants).map(([grantId, grant]) => [grantId, {
        ...grant,
        upstreamTokens: sanitizePersistedUpstreamTokens(grant.upstreamTokens),
      } satisfies OAuthGrant]),
    ),
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
    writeFileSync(tempPath, JSON.stringify(createPersistedStateSnapshot(state), null, 2));
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
    getClientCompatibilityProfile(clientId: string) {
      return state.clientProfiles[clientId];
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
          [`compat-code:${code}`]: createAuthorizationCodeCompatibilityGrant(code, record),
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
    saveClientCompatibilityProfile(clientId: string, profileId: ClientProfileId) {
      state = {
        ...state,
        clientProfiles: {
          ...state.clientProfiles,
          [clientId]: profileId,
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
          [`compat-authorization:${stateId}`]: createPendingAuthorizationCompatibilityGrant(stateId, record),
        },
      };
      persist();
    },
    savePendingConsent(consentId: string, record: PendingConsentRecord) {
      state = {
        ...state,
        grants: {
          ...state.grants,
          [`compat-consent:${consentId}`]: createPendingConsentCompatibilityGrant(consentId, record),
        },
      };
      persist();
    },
    saveRefreshToken(refreshToken: string, record: RefreshTokenRecord) {
      state = {
        ...state,
        grants: {
          ...state.grants,
          [`compat-refresh:${refreshToken}`]: createRefreshTokenCompatibilityGrant(refreshToken, record),
        },
      };
      persist();
    },
  };
}
