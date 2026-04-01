import crypto from "node:crypto";
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
  props?: Record<string, unknown>;
  redirectUri: string;
  scopes: string[];
  subject: string;
  transactionId: string;
  upstreamTokens: Record<string, unknown>;
  used: boolean;
  usedAt?: number;
};

export type RefreshTokenRecord = {
  expiresAt: number;
  grantId: string;
  refreshToken: string;
  active: boolean;
  lastUsedAt?: number;
  retiredAt?: number;
};

export type AccessTokenRecord = {
  accessToken: string;
  clientId: string;
  expiresAt: number;
  grantId: string;
  props?: Record<string, unknown>;
  scopes: string[];
  subject: string;
  transactionId: string;
};

export type GrantRecord = {
  clientId: string;
  grantId: string;
  props?: Record<string, unknown>;
  scopes: string[];
  subject: string;
  transactionId: string;
  upstreamTokens: Record<string, unknown>;
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

type PersistedAuthorizationCodeRecord = Omit<AuthorizationCodeRecord, "code" | "props" | "upstreamTokens"> & {
  propsSealed?: string;
  upstreamTokensSealed: string;
};

type PersistedRefreshTokenRecord = Omit<RefreshTokenRecord, "refreshToken">;

type PersistedAccessTokenRecord = Omit<AccessTokenRecord, "accessToken" | "props"> & {
  propsSealed?: string;
};

type PersistedGrantRecord = Omit<GrantRecord, "props" | "upstreamTokens"> & {
  propsSealed?: string;
  upstreamTokensSealed: string;
};

type PersistedAuthState = {
  accessTokens: Record<string, PersistedAccessTokenRecord>;
  authorizationCodes: Record<string, PersistedAuthorizationCodeRecord>;
  grants: Record<string, PersistedGrantRecord>;
  pendingStates: Record<string, PendingStateRecord>;
  refreshTokens: Record<string, PersistedRefreshTokenRecord>;
  registeredClients: Record<string, RegisteredClientRecord>;
  transactions: Record<string, TransactionRecord>;
};

export type AuthStore = ReturnType<typeof createInMemoryAuthStore>;

function createEmptyState(): PersistedAuthState {
  return {
    accessTokens: {},
    authorizationCodes: {},
    grants: {},
    pendingStates: {},
    refreshTokens: {},
    registeredClients: {},
    transactions: {},
  };
}

function hashSecret(value: string) {
  return crypto.createHash("sha256")
    .update(value, "utf8")
    .digest("base64url");
}

function createSealKey(secret: string) {
  return crypto.createHash("sha256")
    .update(secret, "utf8")
    .digest();
}

function sealJson(secret: string, value: unknown) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", createSealKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString("base64url");
}

function unsealJson<T>(secret: string, sealed: string): T {
  const payload = Buffer.from(sealed, "base64url");
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", createSealKey(secret), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return JSON.parse(plaintext.toString("utf8")) as T;
}

function persistAuthorizationCodeRecord(secret: string, record: AuthorizationCodeRecord): PersistedAuthorizationCodeRecord {
  return {
    clientId: record.clientId,
    codeChallenge: record.codeChallenge,
    codeChallengeMethod: record.codeChallengeMethod,
    expiresAt: record.expiresAt,
    redirectUri: record.redirectUri,
    scopes: record.scopes,
    subject: record.subject,
    transactionId: record.transactionId,
    used: record.used,
    ...(record.usedAt === undefined ? {} : { usedAt: record.usedAt }),
    ...(record.props === undefined ? {} : { propsSealed: sealJson(secret, record.props) }),
    upstreamTokensSealed: sealJson(secret, record.upstreamTokens),
  };
}

function hydrateAuthorizationCodeRecord(
  secret: string,
  code: string,
  record: PersistedAuthorizationCodeRecord,
): AuthorizationCodeRecord {
  return {
    clientId: record.clientId,
    code,
    codeChallenge: record.codeChallenge,
    codeChallengeMethod: record.codeChallengeMethod,
    expiresAt: record.expiresAt,
    ...(record.propsSealed === undefined ? {} : { props: unsealJson<Record<string, unknown>>(secret, record.propsSealed) }),
    redirectUri: record.redirectUri,
    scopes: record.scopes,
    subject: record.subject,
    transactionId: record.transactionId,
    upstreamTokens: unsealJson<Record<string, unknown>>(secret, record.upstreamTokensSealed),
    used: record.used,
    ...(record.usedAt === undefined ? {} : { usedAt: record.usedAt }),
  };
}

function persistAccessTokenRecord(secret: string, record: AccessTokenRecord): PersistedAccessTokenRecord {
  return {
    clientId: record.clientId,
    expiresAt: record.expiresAt,
    grantId: record.grantId,
    ...(record.props === undefined ? {} : { propsSealed: sealJson(secret, record.props) }),
    scopes: record.scopes,
    subject: record.subject,
    transactionId: record.transactionId,
  };
}

function hydrateAccessTokenRecord(
  secret: string,
  accessToken: string,
  record: PersistedAccessTokenRecord,
): AccessTokenRecord {
  return {
    accessToken,
    clientId: record.clientId,
    expiresAt: record.expiresAt,
    grantId: record.grantId,
    ...(record.propsSealed === undefined ? {} : { props: unsealJson<Record<string, unknown>>(secret, record.propsSealed) }),
    scopes: record.scopes,
    subject: record.subject,
    transactionId: record.transactionId,
  };
}

function persistRefreshTokenRecord(record: RefreshTokenRecord): PersistedRefreshTokenRecord {
  return {
    active: record.active,
    expiresAt: record.expiresAt,
    grantId: record.grantId,
    ...(record.lastUsedAt === undefined ? {} : { lastUsedAt: record.lastUsedAt }),
    ...(record.retiredAt === undefined ? {} : { retiredAt: record.retiredAt }),
  };
}

function hydrateRefreshTokenRecord(
  refreshToken: string,
  record: PersistedRefreshTokenRecord,
): RefreshTokenRecord {
  return {
    active: record.active,
    expiresAt: record.expiresAt,
    grantId: record.grantId,
    ...(record.lastUsedAt === undefined ? {} : { lastUsedAt: record.lastUsedAt }),
    refreshToken,
    ...(record.retiredAt === undefined ? {} : { retiredAt: record.retiredAt }),
  };
}

function persistGrantRecord(secret: string, record: GrantRecord): PersistedGrantRecord {
  return {
    clientId: record.clientId,
    grantId: record.grantId,
    ...(record.props === undefined ? {} : { propsSealed: sealJson(secret, record.props) }),
    scopes: record.scopes,
    subject: record.subject,
    transactionId: record.transactionId,
    upstreamTokensSealed: sealJson(secret, record.upstreamTokens),
  };
}

function hydrateGrantRecord(secret: string, record: PersistedGrantRecord): GrantRecord {
  return {
    clientId: record.clientId,
    grantId: record.grantId,
    ...(record.propsSealed === undefined ? {} : { props: unsealJson<Record<string, unknown>>(secret, record.propsSealed) }),
    scopes: record.scopes,
    subject: record.subject,
    transactionId: record.transactionId,
    upstreamTokens: unsealJson<Record<string, unknown>>(secret, record.upstreamTokensSealed),
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
        ? parsed["accessTokens"] as Record<string, PersistedAccessTokenRecord>
        : {},
      authorizationCodes: typeof parsed["authorizationCodes"] === "object" && parsed["authorizationCodes"] !== null
        ? parsed["authorizationCodes"] as Record<string, PersistedAuthorizationCodeRecord>
        : {},
      grants: typeof parsed["grants"] === "object" && parsed["grants"] !== null
        ? parsed["grants"] as Record<string, PersistedGrantRecord>
        : {},
      pendingStates: typeof parsed["pendingStates"] === "object" && parsed["pendingStates"] !== null
        ? parsed["pendingStates"] as Record<string, PendingStateRecord>
        : {},
      refreshTokens: typeof parsed["refreshTokens"] === "object" && parsed["refreshTokens"] !== null
        ? parsed["refreshTokens"] as Record<string, PersistedRefreshTokenRecord>
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
  secret = "auth-store",
) {
  let state = initialState;

  function persist() {
    persistState(state);
  }

  return {
    getAccessToken(accessToken: string) {
      const persisted = state.accessTokens[hashSecret(accessToken)];
      return persisted ? hydrateAccessTokenRecord(secret, accessToken, persisted) : undefined;
    },
    getAuthorizationCode(code: string) {
      const persisted = state.authorizationCodes[hashSecret(code)];
      return persisted ? hydrateAuthorizationCodeRecord(secret, code, persisted) : undefined;
    },
    getGrant(grantId: string) {
      const persisted = state.grants[grantId];
      return persisted ? hydrateGrantRecord(secret, persisted) : undefined;
    },
    getPendingState(stateId: string) {
      return state.pendingStates[stateId];
    },
    getRefreshToken(refreshToken: string) {
      const persisted = state.refreshTokens[hashSecret(refreshToken)];
      return persisted ? hydrateRefreshTokenRecord(refreshToken, persisted) : undefined;
    },
    getRegisteredClient(clientId: string) {
      return state.registeredClients[clientId];
    },
    getTransaction(transactionId: string) {
      return state.transactions[transactionId];
    },
    saveAccessToken(record: AccessTokenRecord) {
      const tokenHash = hashSecret(record.accessToken);
      state = {
        ...state,
        accessTokens: {
          ...state.accessTokens,
          [tokenHash]: persistAccessTokenRecord(secret, record),
        },
      };
      persist();
      return record;
    },
    saveAuthorizationCode(record: AuthorizationCodeRecord) {
      const codeHash = hashSecret(record.code);
      state = {
        ...state,
        authorizationCodes: {
          ...state.authorizationCodes,
          [codeHash]: persistAuthorizationCodeRecord(secret, record),
        },
      };
      persist();
      return record;
    },
    saveGrant(record: GrantRecord) {
      state = {
        ...state,
        grants: {
          ...state.grants,
          [record.grantId]: persistGrantRecord(secret, record),
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
      const refreshTokenHash = hashSecret(record.refreshToken);
      state = {
        ...state,
        refreshTokens: {
          ...state.refreshTokens,
          [refreshTokenHash]: persistRefreshTokenRecord(record),
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
      const codeHash = hashSecret(code);
      const existing = state.authorizationCodes[codeHash];

      if (!existing) {
        return undefined;
      }

      const current = hydrateAuthorizationCodeRecord(secret, code, existing);
      const next = {
        ...current,
        ...updates,
      } satisfies AuthorizationCodeRecord;
      state = {
        ...state,
        authorizationCodes: {
          ...state.authorizationCodes,
          [codeHash]: persistAuthorizationCodeRecord(secret, next),
        },
      };
      persist();
      return next;
    },
    updateGrant(grantId: string, updates: Partial<GrantRecord>) {
      const existing = state.grants[grantId];

      if (!existing) {
        return undefined;
      }

      const current = hydrateGrantRecord(secret, existing);
      const next = {
        ...current,
        ...updates,
      } satisfies GrantRecord;
      state = {
        ...state,
        grants: {
          ...state.grants,
          [grantId]: persistGrantRecord(secret, next),
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
      const refreshTokenHash = hashSecret(refreshToken);
      const existing = state.refreshTokens[refreshTokenHash];

      if (!existing) {
        return undefined;
      }

      const current = hydrateRefreshTokenRecord(refreshToken, existing);
      const next = {
        ...current,
        ...updates,
      } satisfies RefreshTokenRecord;
      state = {
        ...state,
        refreshTokens: {
          ...state.refreshTokens,
          [refreshTokenHash]: persistRefreshTokenRecord(next),
        },
      };
      persist();
      return next;
    },
    retireOtherRefreshTokens(grantId: string, keepRefreshTokens: string[], retiredAt: number) {
      const keepHashes = new Set(keepRefreshTokens.map((refreshToken) => hashSecret(refreshToken)));
      let changed = false;
      const nextRefreshTokens = { ...state.refreshTokens };

      for (const [refreshTokenHash, record] of Object.entries(state.refreshTokens)) {
        if (record.grantId !== grantId || !record.active || keepHashes.has(refreshTokenHash)) {
          continue;
        }

        nextRefreshTokens[refreshTokenHash] = {
          ...record,
          active: false,
          retiredAt,
        };
        changed = true;
      }

      if (!changed) {
        return 0;
      }

      state = {
        ...state,
        refreshTokens: nextRefreshTokens,
      };
      persist();
      return 1;
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

export function createInMemoryAuthStore(options: { secret?: string } = {}) {
  return createAuthStore(createEmptyState(), () => {}, options.secret);
}

export function createFileAuthStore(storePath: string, options: { secret?: string } = {}) {
  const initialState = loadPersistedState(storePath);

  return createAuthStore(initialState, (state) => {
    mkdirSync(path.dirname(storePath), { recursive: true });
    const tempPath = `${storePath}.${process.pid}.tmp`;
    writeFileSync(tempPath, JSON.stringify(state, null, 2));
    renameSync(tempPath, storePath);
  }, options.secret ?? storePath);
}
