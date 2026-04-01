import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
function createEmptyState() {
    return {
        accessTokens: {},
        authorizationCodes: {},
        pendingStates: {},
        refreshTokens: {},
        registeredClients: {},
        transactions: {},
    };
}
function loadPersistedState(storePath) {
    try {
        const parsed = JSON.parse(readFileSync(storePath, "utf8"));
        if (typeof parsed !== "object" || parsed === null) {
            return createEmptyState();
        }
        return {
            accessTokens: typeof parsed["accessTokens"] === "object" && parsed["accessTokens"] !== null
                ? parsed["accessTokens"]
                : {},
            authorizationCodes: typeof parsed["authorizationCodes"] === "object" && parsed["authorizationCodes"] !== null
                ? parsed["authorizationCodes"]
                : {},
            pendingStates: typeof parsed["pendingStates"] === "object" && parsed["pendingStates"] !== null
                ? parsed["pendingStates"]
                : {},
            refreshTokens: typeof parsed["refreshTokens"] === "object" && parsed["refreshTokens"] !== null
                ? parsed["refreshTokens"]
                : {},
            registeredClients: typeof parsed["registeredClients"] === "object" && parsed["registeredClients"] !== null
                ? parsed["registeredClients"]
                : {},
            transactions: typeof parsed["transactions"] === "object" && parsed["transactions"] !== null
                ? parsed["transactions"]
                : {},
        };
    }
    catch (error) {
        if (typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "ENOENT") {
            return createEmptyState();
        }
        throw error;
    }
}
function createAuthStore(initialState, persistState) {
    let state = initialState;
    function persist() {
        persistState(state);
    }
    return {
        getAccessToken(accessToken) {
            return state.accessTokens[accessToken];
        },
        getAuthorizationCode(code) {
            return state.authorizationCodes[code];
        },
        getPendingState(stateId) {
            return state.pendingStates[stateId];
        },
        getRefreshToken(refreshToken) {
            return state.refreshTokens[refreshToken];
        },
        getRegisteredClient(clientId) {
            return state.registeredClients[clientId];
        },
        getTransaction(transactionId) {
            return state.transactions[transactionId];
        },
        saveAccessToken(record) {
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
        saveAuthorizationCode(record) {
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
        savePendingState(record) {
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
        saveRefreshToken(record) {
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
        saveRegisteredClient(record) {
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
        saveTransaction(record) {
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
        updateAuthorizationCode(code, updates) {
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
        updatePendingState(stateId, updates) {
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
        updateRefreshToken(refreshToken, updates) {
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
        updateTransaction(transactionId, updates) {
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
    return createAuthStore(createEmptyState(), () => { });
}
export function createFileAuthStore(storePath) {
    const initialState = loadPersistedState(storePath);
    return createAuthStore(initialState, (state) => {
        mkdirSync(path.dirname(storePath), { recursive: true });
        const tempPath = `${storePath}.${process.pid}.tmp`;
        writeFileSync(tempPath, JSON.stringify(state, null, 2));
        renameSync(tempPath, storePath);
    });
}
