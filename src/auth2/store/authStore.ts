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

export type AuthStore = ReturnType<typeof createInMemoryAuthStore>;

export function createInMemoryAuthStore() {
  const accessTokens = new Map<string, AccessTokenRecord>();
  const pendingStates = new Map<string, PendingStateRecord>();
  const transactions = new Map<string, TransactionRecord>();
  const authorizationCodes = new Map<string, AuthorizationCodeRecord>();
  const refreshTokens = new Map<string, RefreshTokenRecord>();

  return {
    getAccessToken(accessToken: string) {
      return accessTokens.get(accessToken);
    },
    getAuthorizationCode(code: string) {
      return authorizationCodes.get(code);
    },
    getPendingState(stateId: string) {
      return pendingStates.get(stateId);
    },
    getRefreshToken(refreshToken: string) {
      return refreshTokens.get(refreshToken);
    },
    getTransaction(transactionId: string) {
      return transactions.get(transactionId);
    },
    saveAccessToken(record: AccessTokenRecord) {
      accessTokens.set(record.accessToken, record);
      return record;
    },
    saveAuthorizationCode(record: AuthorizationCodeRecord) {
      authorizationCodes.set(record.code, record);
      return record;
    },
    savePendingState(record: PendingStateRecord) {
      pendingStates.set(record.stateId, record);
      return record;
    },
    saveRefreshToken(record: RefreshTokenRecord) {
      refreshTokens.set(record.refreshToken, record);
      return record;
    },
    saveTransaction(record: TransactionRecord) {
      transactions.set(record.transactionId, record);
      return record;
    },
    updateAuthorizationCode(code: string, updates: Partial<AuthorizationCodeRecord>) {
      const existing = authorizationCodes.get(code);

      if (!existing) {
        return undefined;
      }

      const next = {
        ...existing,
        ...updates,
      };
      authorizationCodes.set(code, next);
      return next;
    },
    updatePendingState(stateId: string, updates: Partial<PendingStateRecord>) {
      const existing = pendingStates.get(stateId);

      if (!existing) {
        return undefined;
      }

      const next = {
        ...existing,
        ...updates,
      };
      pendingStates.set(stateId, next);
      return next;
    },
    updateRefreshToken(refreshToken: string, updates: Partial<RefreshTokenRecord>) {
      const existing = refreshTokens.get(refreshToken);

      if (!existing) {
        return undefined;
      }

      const next = {
        ...existing,
        ...updates,
      };
      refreshTokens.set(refreshToken, next);
      return next;
    },
    updateTransaction(transactionId: string, updates: Partial<TransactionRecord>) {
      const existing = transactions.get(transactionId);

      if (!existing) {
        return undefined;
      }

      const next = {
        ...existing,
        ...updates,
      };
      transactions.set(transactionId, next);
      return next;
    },
  };
}
