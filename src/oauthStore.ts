import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

type ApprovalRecord = {
  clientId: string;
  resource: string;
  scopes: string[];
};

type PersistedOAuthState = {
  approvals: ApprovalRecord[];
  authorizationCodes: Record<string, AuthorizationCodeRecord>;
  clients: Record<string, OAuthClientInformationFull>;
  pendingAuthorizations: Record<string, PendingAuthorizationRecord>;
  pendingConsents: Record<string, PendingConsentRecord>;
  refreshTokens: Record<string, RefreshTokenRecord>;
  version: 1;
};

type PendingConsentRecord = {
  clientId: string;
  clientName?: string;
  codeChallenge: string;
  expiresAt: number;
  redirectUri: string;
  resource: string;
  scopes: string[];
  state?: string;
};

type PendingAuthorizationRecord = Omit<PendingConsentRecord, "clientName">;

type AuthorizationCodeRecord = PendingAuthorizationRecord & {
  expiresAt: number;
  subject: string;
  upstreamTokens: OAuthTokens;
};

type RefreshTokenRecord = {
  clientId: string;
  expiresAt: number;
  resource: string;
  scopes: string[];
  subject: string;
  upstreamTokens: OAuthTokens;
};

function normalizeScopes(scopes: string[]) {
  return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))].sort();
}

function createEmptyState(): PersistedOAuthState {
  return {
    approvals: [],
    authorizationCodes: {},
    clients: {},
    pendingAuthorizations: {},
    pendingConsents: {},
    refreshTokens: {},
    version: 1,
  };
}

function pruneExpiredEntries(state: PersistedOAuthState) {
  const now = Date.now();

  const pruneRecordMap = <T extends { expiresAt: number }>(records: Record<string, T>) => (
    Object.fromEntries(Object.entries(records).filter(([, record]) => record.expiresAt > now))
  );

  return {
    ...state,
    authorizationCodes: pruneRecordMap(state.authorizationCodes),
    pendingAuthorizations: pruneRecordMap(state.pendingAuthorizations),
    pendingConsents: pruneRecordMap(state.pendingConsents),
    refreshTokens: pruneRecordMap(state.refreshTokens),
  };
}

function loadState(storePath: string | undefined): PersistedOAuthState {
  if (!storePath) {
    return createEmptyState();
  }

  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8")) as Partial<PersistedOAuthState>;

    return {
      approvals: Array.isArray(parsed.approvals)
        ? parsed.approvals
          .filter((approval): approval is ApprovalRecord => (
            typeof approval === "object" &&
            approval !== null &&
            typeof approval.clientId === "string" &&
            typeof approval.resource === "string" &&
            Array.isArray(approval.scopes)
          ))
          .map((approval) => ({
            clientId: approval.clientId,
            resource: approval.resource,
            scopes: normalizeScopes(approval.scopes),
          }))
        : [],
      authorizationCodes: parsed.authorizationCodes && typeof parsed.authorizationCodes === "object"
        ? parsed.authorizationCodes as Record<string, AuthorizationCodeRecord>
        : {},
      clients: parsed.clients && typeof parsed.clients === "object"
        ? parsed.clients as Record<string, OAuthClientInformationFull>
        : {},
      pendingAuthorizations: parsed.pendingAuthorizations && typeof parsed.pendingAuthorizations === "object"
        ? parsed.pendingAuthorizations as Record<string, PendingAuthorizationRecord>
        : {},
      pendingConsents: parsed.pendingConsents && typeof parsed.pendingConsents === "object"
        ? parsed.pendingConsents as Record<string, PendingConsentRecord>
        : {},
      refreshTokens: parsed.refreshTokens && typeof parsed.refreshTokens === "object"
        ? parsed.refreshTokens as Record<string, RefreshTokenRecord>
        : {},
      version: 1,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createEmptyState();
    }

    throw error;
  }
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

  if (storePath) {
    persist();
  }

  function isExpired(record: { expiresAt: number } | undefined) {
    return record !== undefined && record.expiresAt <= Date.now();
  }

  return {
    approveClient(record: ApprovalRecord) {
      const normalizedRecord = {
        ...record,
        scopes: normalizeScopes(record.scopes),
      };

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
    getClient(clientId: string) {
      return state.clients[clientId];
    },
    getAuthorizationCode(code: string) {
      const record = state.authorizationCodes[code];

      if (isExpired(record)) {
        const authorizationCodes = { ...state.authorizationCodes };
        delete authorizationCodes[code];
        state = {
          ...state,
          authorizationCodes,
        };
        persist();
        return undefined;
      }

      return record;
    },
    getPendingAuthorization(stateId: string) {
      const record = state.pendingAuthorizations[stateId];

      if (isExpired(record)) {
        const pendingAuthorizations = { ...state.pendingAuthorizations };
        delete pendingAuthorizations[stateId];
        state = {
          ...state,
          pendingAuthorizations,
        };
        persist();
        return undefined;
      }

      return record;
    },
    getPendingConsent(consentId: string) {
      const record = state.pendingConsents[consentId];

      if (isExpired(record)) {
        const pendingConsents = { ...state.pendingConsents };
        delete pendingConsents[consentId];
        state = {
          ...state,
          pendingConsents,
        };
        persist();
        return undefined;
      }

      return record;
    },
    getRefreshToken(refreshToken: string) {
      const record = state.refreshTokens[refreshToken];

      if (isExpired(record)) {
        const refreshTokens = { ...state.refreshTokens };
        delete refreshTokens[refreshToken];
        state = {
          ...state,
          refreshTokens,
        };
        persist();
        return undefined;
      }

      return record;
    },
    isClientApproved(record: ApprovalRecord) {
      const normalizedScopes = normalizeScopes(record.scopes);

      return state.approvals.some((approval) => (
        approval.clientId === record.clientId &&
        approval.resource === record.resource &&
        approval.scopes.join(" ") === normalizedScopes.join(" ")
      ));
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
    saveAuthorizationCode(code: string, record: AuthorizationCodeRecord) {
      state = {
        ...state,
        authorizationCodes: {
          ...state.authorizationCodes,
          [code]: {
            ...record,
            scopes: normalizeScopes(record.scopes),
          },
        },
      };
      persist();
    },
    savePendingAuthorization(stateId: string, record: PendingAuthorizationRecord) {
      state = {
        ...state,
        pendingAuthorizations: {
          ...state.pendingAuthorizations,
          [stateId]: {
            ...record,
            scopes: normalizeScopes(record.scopes),
          },
        },
      };
      persist();
    },
    savePendingConsent(consentId: string, record: PendingConsentRecord) {
      state = {
        ...state,
        pendingConsents: {
          ...state.pendingConsents,
          [consentId]: {
            ...record,
            scopes: normalizeScopes(record.scopes),
          },
        },
      };
      persist();
    },
    saveRefreshToken(refreshToken: string, record: RefreshTokenRecord) {
      state = {
        ...state,
        refreshTokens: {
          ...state.refreshTokens,
          [refreshToken]: {
            ...record,
            scopes: normalizeScopes(record.scopes),
          },
        },
      };
      persist();
    },
    deleteAuthorizationCode(code: string) {
      if (!(code in state.authorizationCodes)) {
        return;
      }

      const authorizationCodes = { ...state.authorizationCodes };
      delete authorizationCodes[code];
      state = {
        ...state,
        authorizationCodes,
      };
      persist();
    },
    deletePendingAuthorization(stateId: string) {
      if (!(stateId in state.pendingAuthorizations)) {
        return;
      }

      const pendingAuthorizations = { ...state.pendingAuthorizations };
      delete pendingAuthorizations[stateId];
      state = {
        ...state,
        pendingAuthorizations,
      };
      persist();
    },
    deletePendingConsent(consentId: string) {
      if (!(consentId in state.pendingConsents)) {
        return;
      }

      const pendingConsents = { ...state.pendingConsents };
      delete pendingConsents[consentId];
      state = {
        ...state,
        pendingConsents,
      };
      persist();
    },
    deleteRefreshToken(refreshToken: string) {
      if (!(refreshToken in state.refreshTokens)) {
        return;
      }

      const refreshTokens = { ...state.refreshTokens };
      delete refreshTokens[refreshToken];
      state = {
        ...state,
        refreshTokens,
      };
      persist();
    },
  };
}
