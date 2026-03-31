import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export type PendingStateRecord = {
  expiresAt: number;
  stateId: string;
  transactionId: string;
  used: boolean;
  usedAt?: number;
};

export type TransactionRecord = {
  clientId: string;
  createdAt: number;
  expiresAt: number;
  providerId: string;
  redirectUri: string;
  scopes: string[];
  transactionId: string;
  downstreamCodeChallenge?: string;
  downstreamCodeChallengeMethod?: "S256";
  downstreamState?: string;
  upstreamCodeVerifier?: string;
  upstreamState?: string;
};

export type AuthorizationCodeRecord = {
  clientId: string;
  code: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  expiresAt: number;
  redirectUri: string;
  scopes: string[];
  subject: string;
  transactionId: string;
  upstreamTokens: Record<string, unknown>;
  used: boolean;
  usedAt?: number;
};

export type RefreshTokenRecord = {
  clientId: string;
  expiresAt: number;
  refreshToken: string;
  scopes: string[];
  subject: string;
  transactionId: string;
  upstreamTokens: Record<string, unknown>;
  used: boolean;
  usedAt?: number;
};

export type AccessTokenRecord = {
  accessToken: string;
  clientId: string;
  expiresAt: number;
  scopes: string[];
  subject: string;
  transactionId: string;
};

export type RegisteredClientRecord = {
  clientId: string;
  clientIdIssuedAt: number;
  clientName?: string;
  grantTypes: string[];
  providerId: string;
  redirectUri: string;
  responseTypes: string[];
  scopes: string[];
  tokenEndpointAuthMethod: "none";
};

type PersistedAuthState = {
  accessTokens: Record<string, AccessTokenRecord>;
  authorizationCodes: Record<string, AuthorizationCodeRecord>;
  pendingStates: Record<string, PendingStateRecord>;
  refreshTokens: Record<string, RefreshTokenRecord>;
  registeredClients: Record<string, RegisteredClientRecord>;
  transactions: Record<string, TransactionRecord>;
};

export type AuthStore = ReturnType<typeof createInMemoryAuthStore>;

function createEmptyState(): PersistedAuthState {
  return {
    accessTokens: {},
    authorizationCodes: {},
    pendingStates: {},
    refreshTokens: {},
    registeredClients: {},
    transactions: {},
  };
}

function loadPersistedState(storePath: string): PersistedAuthState {
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));

    if (typeof parsed !== "object" || parsed === null) {
      return createEmptyState();
    }

    return {
      accessTokens: typeof parsed["accessTokens"] === "object" && parsed["accessTokens"] !== null
        ? parsed["accessTokens"] as Record<string, AccessTokenRecord>
        : {},
      authorizationCodes: typeof parsed["authorizationCodes"] === "object" && parsed["authorizationCodes"] !== null
        ? parsed["authorizationCodes"] as Record<string, AuthorizationCodeRecord>
        : {},
      pendingStates: typeof parsed["pendingStates"] === "object" && parsed["pendingStates"] !== null
        ? parsed["pendingStates"] as Record<string, PendingStateRecord>
        : {},
      refreshTokens: typeof parsed["refreshTokens"] === "object" && parsed["refreshTokens"] !== null
        ? parsed["refreshTokens"] as Record<string, RefreshTokenRecord>
        : {},
      registeredClients: typeof parsed["registeredClients"] === "object" && parsed["registeredClients"] !== null
        ? parsed["registeredClients"] as Record<string, RegisteredClientRecord>
        : {},
      transactions: typeof parsed["transactions"] === "object" && parsed["transactions"] !== null
        ? parsed["transactions"] as Record<string, TransactionRecord>
        : {},
    };
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

function createAuthStore(
  initialState: PersistedAuthState,
  persistState: (state: PersistedAuthState) => void,
) {
  let state = initialState;

  function persist() {
    persistState(state);
  }

  return {
    getAccessToken(accessToken: string) {
      return state.accessTokens[accessToken];
    },
    getAuthorizationCode(code: string) {
      return state.authorizationCodes[code];
    },
    getPendingState(stateId: string) {
      return state.pendingStates[stateId];
    },
    getRefreshToken(refreshToken: string) {
      return state.refreshTokens[refreshToken];
    },
    getRegisteredClient(clientId: string) {
      return state.registeredClients[clientId];
    },
    getTransaction(transactionId: string) {
      return state.transactions[transactionId];
    },
    saveAccessToken(record: AccessTokenRecord) {
      state = {
        ...state,
        accessTokens: {
          ...state.accessTokens,
          [record.accessToken]: record,
        },
      };
      persist();
      return record;
    },
    saveAuthorizationCode(record: AuthorizationCodeRecord) {
      state = {
        ...state,
        authorizationCodes: {
          ...state.authorizationCodes,
          [record.code]: record,
        },
      };
      persist();
      return record;
    },
    savePendingState(record: PendingStateRecord) {
      state = {
        ...state,
        pendingStates: {
          ...state.pendingStates,
          [record.stateId]: record,
        },
      };
      persist();
      return record;
    },
    saveRefreshToken(record: RefreshTokenRecord) {
      state = {
        ...state,
        refreshTokens: {
          ...state.refreshTokens,
          [record.refreshToken]: record,
        },
      };
      persist();
      return record;
    },
    saveRegisteredClient(record: RegisteredClientRecord) {
      state = {
        ...state,
        registeredClients: {
          ...state.registeredClients,
          [record.clientId]: record,
        },
      };
      persist();
      return record;
    },
    saveTransaction(record: TransactionRecord) {
      state = {
        ...state,
        transactions: {
          ...state.transactions,
          [record.transactionId]: record,
        },
      };
      persist();
      return record;
    },
    updateAuthorizationCode(code: string, updates: Partial<AuthorizationCodeRecord>) {
      const existing = state.authorizationCodes[code];

      if (!existing) {
        return undefined;
      }

      const next = {
        ...existing,
        ...updates,
      };
      state = {
        ...state,
        authorizationCodes: {
          ...state.authorizationCodes,
          [code]: next,
        },
      };
      persist();
      return next;
    },
    updatePendingState(stateId: string, updates: Partial<PendingStateRecord>) {
      const existing = state.pendingStates[stateId];

      if (!existing) {
        return undefined;
      }

      const next = {
        ...existing,
        ...updates,
      };
      state = {
        ...state,
        pendingStates: {
          ...state.pendingStates,
          [stateId]: next,
        },
      };
      persist();
      return next;
    },
    updateRefreshToken(refreshToken: string, updates: Partial<RefreshTokenRecord>) {
      const existing = state.refreshTokens[refreshToken];

      if (!existing) {
        return undefined;
      }

      const next = {
        ...existing,
        ...updates,
      };
      state = {
        ...state,
        refreshTokens: {
          ...state.refreshTokens,
          [refreshToken]: next,
        },
      };
      persist();
      return next;
    },
    updateTransaction(transactionId: string, updates: Partial<TransactionRecord>) {
      const existing = state.transactions[transactionId];

      if (!existing) {
        return undefined;
      }

      const next = {
        ...existing,
        ...updates,
      };
      state = {
        ...state,
        transactions: {
          ...state.transactions,
          [transactionId]: next,
        },
      };
      persist();
      return next;
    },
  };
}

export function createInMemoryAuthStore() {
  return createAuthStore(createEmptyState(), () => {});
}

export function createFileAuthStore(storePath: string) {
  const initialState = loadPersistedState(storePath);

  return createAuthStore(initialState, (state) => {
    mkdirSync(path.dirname(storePath), { recursive: true });
    const tempPath = `${storePath}.${process.pid}.tmp`;
    writeFileSync(tempPath, JSON.stringify(state, null, 2));
    renameSync(tempPath, storePath);
  });
}
