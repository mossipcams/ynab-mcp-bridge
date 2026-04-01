import crypto from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
function createEmptyState() {
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
function hashSecret(value) {
    return crypto.createHash("sha256")
        .update(value, "utf8")
        .digest("base64url");
}
function createSealKey(secret) {
    return crypto.createHash("sha256")
        .update(secret, "utf8")
        .digest();
}
function sealJson(secret, value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", createSealKey(secret), iv);
    const plaintext = Buffer.from(JSON.stringify(value), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]).toString("base64url");
}
function unsealJson(secret, sealed) {
    const payload = Buffer.from(sealed, "base64url");
    const iv = payload.subarray(0, 12);
    const authTag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", createSealKey(secret), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8"));
}
function persistAuthorizationCodeRecord(secret, record) {
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
function hydrateAuthorizationCodeRecord(secret, code, record) {
    return {
        clientId: record.clientId,
        code,
        codeChallenge: record.codeChallenge,
        codeChallengeMethod: record.codeChallengeMethod,
        expiresAt: record.expiresAt,
        ...(record.propsSealed === undefined ? {} : { props: unsealJson(secret, record.propsSealed) }),
        redirectUri: record.redirectUri,
        scopes: record.scopes,
        subject: record.subject,
        transactionId: record.transactionId,
        upstreamTokens: unsealJson(secret, record.upstreamTokensSealed),
        used: record.used,
        ...(record.usedAt === undefined ? {} : { usedAt: record.usedAt }),
    };
}
function persistAccessTokenRecord(secret, record) {
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
function hydrateAccessTokenRecord(secret, accessToken, record) {
    return {
        accessToken,
        clientId: record.clientId,
        expiresAt: record.expiresAt,
        grantId: record.grantId,
        ...(record.propsSealed === undefined ? {} : { props: unsealJson(secret, record.propsSealed) }),
        scopes: record.scopes,
        subject: record.subject,
        transactionId: record.transactionId,
    };
}
function persistRefreshTokenRecord(record) {
    return {
        active: record.active,
        expiresAt: record.expiresAt,
        grantId: record.grantId,
        ...(record.lastUsedAt === undefined ? {} : { lastUsedAt: record.lastUsedAt }),
        ...(record.retiredAt === undefined ? {} : { retiredAt: record.retiredAt }),
    };
}
function hydrateRefreshTokenRecord(refreshToken, record) {
    return {
        active: record.active,
        expiresAt: record.expiresAt,
        grantId: record.grantId,
        ...(record.lastUsedAt === undefined ? {} : { lastUsedAt: record.lastUsedAt }),
        refreshToken,
        ...(record.retiredAt === undefined ? {} : { retiredAt: record.retiredAt }),
    };
}
function persistGrantRecord(secret, record) {
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
function hydrateGrantRecord(secret, record) {
    return {
        clientId: record.clientId,
        grantId: record.grantId,
        ...(record.propsSealed === undefined ? {} : { props: unsealJson(secret, record.propsSealed) }),
        scopes: record.scopes,
        subject: record.subject,
        transactionId: record.transactionId,
        upstreamTokens: unsealJson(secret, record.upstreamTokensSealed),
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
            grants: typeof parsed["grants"] === "object" && parsed["grants"] !== null
                ? parsed["grants"]
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
function createAuthStore(initialState, persistState, secret = "auth-store") {
    let state = initialState;
    function persist() {
        persistState(state);
    }
    return {
        getAccessToken(accessToken) {
            const persisted = state.accessTokens[hashSecret(accessToken)];
            return persisted ? hydrateAccessTokenRecord(secret, accessToken, persisted) : undefined;
        },
        getAuthorizationCode(code) {
            const persisted = state.authorizationCodes[hashSecret(code)];
            return persisted ? hydrateAuthorizationCodeRecord(secret, code, persisted) : undefined;
        },
        getGrant(grantId) {
            const persisted = state.grants[grantId];
            return persisted ? hydrateGrantRecord(secret, persisted) : undefined;
        },
        getPendingState(stateId) {
            return state.pendingStates[stateId];
        },
        getRefreshToken(refreshToken) {
            const persisted = state.refreshTokens[hashSecret(refreshToken)];
            return persisted ? hydrateRefreshTokenRecord(refreshToken, persisted) : undefined;
        },
        getRegisteredClient(clientId) {
            return state.registeredClients[clientId];
        },
        getTransaction(transactionId) {
            return state.transactions[transactionId];
        },
        saveAccessToken(record) {
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
        saveAuthorizationCode(record) {
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
        saveGrant(record) {
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
            const codeHash = hashSecret(code);
            const existing = state.authorizationCodes[codeHash];
            if (!existing) {
                return undefined;
            }
            const current = hydrateAuthorizationCodeRecord(secret, code, existing);
            const next = {
                ...current,
                ...updates,
            };
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
        updateGrant(grantId, updates) {
            const existing = state.grants[grantId];
            if (!existing) {
                return undefined;
            }
            const current = hydrateGrantRecord(secret, existing);
            const next = {
                ...current,
                ...updates,
            };
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
            const refreshTokenHash = hashSecret(refreshToken);
            const existing = state.refreshTokens[refreshTokenHash];
            if (!existing) {
                return undefined;
            }
            const current = hydrateRefreshTokenRecord(refreshToken, existing);
            const next = {
                ...current,
                ...updates,
            };
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
        retireOtherRefreshTokens(grantId, keepRefreshTokens, retiredAt) {
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
export function createInMemoryAuthStore(options = {}) {
    return createAuthStore(createEmptyState(), () => { }, options.secret);
}
export function createFileAuthStore(storePath, options = {}) {
    const initialState = loadPersistedState(storePath);
    return createAuthStore(initialState, (state) => {
        mkdirSync(path.dirname(storePath), { recursive: true });
        const tempPath = `${storePath}.${process.pid}.tmp`;
        writeFileSync(tempPath, JSON.stringify(state, null, 2));
        renameSync(tempPath, storePath);
    }, options.secret ?? storePath);
}
