const analysisStateStoreSymbol = Symbol("ynabFinancialAnalysisStateStore");

type AnalysisStateStore = {
  counter: number;
  sessions: Map<string, AnalysisSessionRecord>;
};

type ApiWithAnalysisStateStore = object & {
  [analysisStateStoreSymbol]?: AnalysisStateStore;
};

type TimestampOptions = {
  now?: string;
};

type CreateAnalysisSessionOptions = TimestampOptions & {
  ttlMs?: number;
};

type GetAnalysisSessionOptions = TimestampOptions;

export type AnalysisSessionKind =
  | "spending_change"
  | "spending_anomalies"
  | "category_change"
  | "payee_spike"
  | "summary_snapshot";

export type AnalysisSessionRecord = {
  createdAt: string;
  expiresAt: string;
  kind: AnalysisSessionKind;
  payload: unknown;
  planId?: string;
  token: string;
};

const DEFAULT_ANALYSIS_TTL_MS = 15 * 60 * 1000;

function getNowIsoString(options: TimestampOptions = {}) {
  return options.now ?? new Date().toISOString();
}

function getExpiresAtIsoString(nowIso: string, ttlMs: number) {
  return new Date(Date.parse(nowIso) + ttlMs).toISOString();
}

function getAnalysisStateStore(api: ApiWithAnalysisStateStore): AnalysisStateStore {
  if (api[analysisStateStoreSymbol]) {
    return api[analysisStateStoreSymbol];
  }

  const store: AnalysisStateStore = {
    counter: 0,
    sessions: new Map<string, AnalysisSessionRecord>(),
  };
  Object.defineProperty(api, analysisStateStoreSymbol, {
    configurable: false,
    enumerable: false,
    value: store,
    writable: false,
  });

  return store;
}

export function createAnalysisSession(
  api: object,
  input: {
    kind: AnalysisSessionKind;
    payload: unknown;
    planId?: string;
  },
  options: CreateAnalysisSessionOptions = {},
): AnalysisSessionRecord {
  const store = getAnalysisStateStore(api as ApiWithAnalysisStateStore);
  const nowIso = getNowIsoString(options);
  const ttlMs = options.ttlMs ?? DEFAULT_ANALYSIS_TTL_MS;
  store.counter += 1;

  const session: AnalysisSessionRecord = {
    token: `analysis_${store.counter.toString(36)}`,
    kind: input.kind,
    payload: input.payload,
    createdAt: nowIso,
    expiresAt: getExpiresAtIsoString(nowIso, ttlMs),
    ...(input.planId ? { planId: input.planId } : {}),
  };

  store.sessions.set(session.token, session);
  return session;
}

export function getAnalysisSession(
  api: object,
  token: string,
  options: GetAnalysisSessionOptions = {},
): AnalysisSessionRecord | undefined {
  const store = getAnalysisStateStore(api as ApiWithAnalysisStateStore);
  const session = store.sessions.get(token);

  if (!session) {
    return undefined;
  }

  if (Date.parse(session.expiresAt) <= Date.parse(getNowIsoString(options))) {
    store.sessions.delete(token);
    return undefined;
  }

  return session;
}
