const analysisStateStoreSymbol = Symbol("ynabFinancialAnalysisStateStore");
const DEFAULT_ANALYSIS_TTL_MS = 15 * 60 * 1000;
function getNowIsoString(options = {}) {
    return options.now ?? new Date().toISOString();
}
function getExpiresAtIsoString(nowIso, ttlMs) {
    return new Date(Date.parse(nowIso) + ttlMs).toISOString();
}
function getAnalysisStateStore(api) {
    if (api[analysisStateStoreSymbol]) {
        return api[analysisStateStoreSymbol];
    }
    const store = {
        counter: 0,
        sessions: new Map(),
    };
    Object.defineProperty(api, analysisStateStoreSymbol, {
        configurable: false,
        enumerable: false,
        value: store,
        writable: false,
    });
    return store;
}
export function createAnalysisSession(api, input, options = {}) {
    const store = getAnalysisStateStore(api);
    const nowIso = getNowIsoString(options);
    const ttlMs = options.ttlMs ?? DEFAULT_ANALYSIS_TTL_MS;
    store.counter += 1;
    const session = {
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
export function getAnalysisSession(api, token, options = {}) {
    const store = getAnalysisStateStore(api);
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
