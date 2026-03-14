import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
function normalizeScopes(scopes) {
    return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))].sort();
}
function createEmptyState() {
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
function pruneExpiredEntries(state) {
    const now = Date.now();
    const pruneRecordMap = (records) => (Object.fromEntries(Object.entries(records).filter(([, record]) => record.expiresAt > now)));
    return {
        ...state,
        authorizationCodes: pruneRecordMap(state.authorizationCodes),
        pendingAuthorizations: pruneRecordMap(state.pendingAuthorizations),
        pendingConsents: pruneRecordMap(state.pendingConsents),
        refreshTokens: pruneRecordMap(state.refreshTokens),
    };
}
function loadState(storePath) {
    if (!storePath) {
        return createEmptyState();
    }
    try {
        const parsed = JSON.parse(readFileSync(storePath, "utf8"));
        return {
            approvals: Array.isArray(parsed.approvals)
                ? parsed.approvals
                    .filter((approval) => (typeof approval === "object" &&
                    approval !== null &&
                    typeof approval.clientId === "string" &&
                    typeof approval.resource === "string" &&
                    Array.isArray(approval.scopes)))
                    .map((approval) => ({
                    clientId: approval.clientId,
                    resource: approval.resource,
                    scopes: normalizeScopes(approval.scopes),
                }))
                : [],
            authorizationCodes: parsed.authorizationCodes && typeof parsed.authorizationCodes === "object"
                ? parsed.authorizationCodes
                : {},
            clients: parsed.clients && typeof parsed.clients === "object"
                ? parsed.clients
                : {},
            pendingAuthorizations: parsed.pendingAuthorizations && typeof parsed.pendingAuthorizations === "object"
                ? parsed.pendingAuthorizations
                : {},
            pendingConsents: parsed.pendingConsents && typeof parsed.pendingConsents === "object"
                ? parsed.pendingConsents
                : {},
            refreshTokens: parsed.refreshTokens && typeof parsed.refreshTokens === "object"
                ? parsed.refreshTokens
                : {},
            version: 1,
        };
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return createEmptyState();
        }
        throw error;
    }
}
export function createOAuthStore(storePath) {
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
    function isExpired(record) {
        return record !== undefined && record.expiresAt <= Date.now();
    }
    return {
        approveClient(record) {
            const normalizedRecord = {
                ...record,
                scopes: normalizeScopes(record.scopes),
            };
            if (!state.approvals.some((approval) => (approval.clientId === normalizedRecord.clientId &&
                approval.resource === normalizedRecord.resource &&
                approval.scopes.join(" ") === normalizedRecord.scopes.join(" ")))) {
                state = {
                    ...state,
                    approvals: [...state.approvals, normalizedRecord],
                };
                persist();
            }
        },
        getClient(clientId) {
            return state.clients[clientId];
        },
        getAuthorizationCode(code) {
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
        getPendingAuthorization(stateId) {
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
        getPendingConsent(consentId) {
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
        getRefreshToken(refreshToken) {
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
        isClientApproved(record) {
            const normalizedScopes = normalizeScopes(record.scopes);
            return state.approvals.some((approval) => (approval.clientId === record.clientId &&
                approval.resource === record.resource &&
                approval.scopes.join(" ") === normalizedScopes.join(" ")));
        },
        saveClient(client) {
            state = {
                ...state,
                clients: {
                    ...state.clients,
                    [client.client_id]: client,
                },
            };
            persist();
        },
        saveAuthorizationCode(code, record) {
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
        savePendingAuthorization(stateId, record) {
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
        savePendingConsent(consentId, record) {
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
        saveRefreshToken(refreshToken, record) {
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
        deleteAuthorizationCode(code) {
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
        deletePendingAuthorization(stateId) {
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
        deletePendingConsent(consentId) {
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
        deleteRefreshToken(refreshToken) {
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
