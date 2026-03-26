/**
 * Owns: persisted approvals/clients/client-profiles/grants state, legacy migration, pruning, and atomic file persistence.
 * Inputs/dependencies: store path plus grant normalization helpers.
 * Outputs/contracts: createOAuthStore(...) and the persistence contract consumed by grant lifecycle and the OAuth runtime.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getGrantExpiry, hasActiveGrantStep, normalizeGrant, normalizeScopes, } from "./oauthGrant.js";
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function isApprovalRecord(value) {
    if (!isRecord(value)) {
        return false;
    }
    return typeof value.clientId === "string" &&
        typeof value.resource === "string" &&
        Array.isArray(value.scopes);
}
function normalizeApprovalRecord(record) {
    return {
        ...record,
        scopes: normalizeScopes(record.scopes),
    };
}
function createEmptyState() {
    return {
        approvals: [],
        clients: {},
        clientProfiles: {},
        grants: {},
        version: 2,
    };
}
function parseApprovals(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter(isApprovalRecord)
        .map(normalizeApprovalRecord);
}
function parseClients(value) {
    if (!value || typeof value !== "object") {
        return {};
    }
    return value;
}
function parseClientProfiles(value) {
    if (!value || typeof value !== "object") {
        return {};
    }
    return Object.fromEntries(Object.entries(value)
        .filter((entry) => (typeof entry[0] === "string" &&
        (entry[1] === "chatgpt" || entry[1] === "claude" || entry[1] === "codex" || entry[1] === "generic"))));
}
function parseGrantRecord(value) {
    if (!value || typeof value !== "object") {
        return undefined;
    }
    const grant = value;
    if (typeof grant.grantId !== "string" ||
        typeof grant.clientId !== "string" ||
        typeof grant.codeChallenge !== "string" ||
        typeof grant.redirectUri !== "string" ||
        typeof grant.resource !== "string" ||
        !Array.isArray(grant.scopes)) {
        return undefined;
    }
    return normalizeGrant({
        authorizationCode: grant.authorizationCode,
        clientId: grant.clientId,
        clientName: grant.clientName,
        compatibilityProfileId: grant.compatibilityProfileId,
        codeChallenge: grant.codeChallenge,
        consent: grant.consent,
        grantId: grant.grantId,
        pendingAuthorization: grant.pendingAuthorization,
        redirectUri: grant.redirectUri,
        refreshToken: grant.refreshToken,
        resource: grant.resource,
        scopes: grant.scopes,
        state: grant.state,
        principalId: grant.principalId,
        subject: grant.subject,
        upstreamTokens: grant.upstreamTokens,
    });
}
function parseGrants(value) {
    if (!value || typeof value !== "object") {
        return {};
    }
    return Object.fromEntries(Object.entries(value)
        .map(([grantId, record]) => {
        const parsed = parseGrantRecord(record);
        if (!parsed) {
            return undefined;
        }
        return [grantId, {
                ...parsed,
                grantId,
            }];
    })
        .filter((entry) => entry !== undefined));
}
function migrateLegacyState(parsed) {
    const grants = {};
    const pushGrant = (grant) => {
        grants[grant.grantId] = normalizeGrant(grant);
    };
    if (parsed.pendingConsents && typeof parsed.pendingConsents === "object") {
        for (const [consentId, record] of Object.entries(parsed.pendingConsents)) {
            const pending = record;
            if (typeof pending.clientId === "string" &&
                typeof pending.codeChallenge === "string" &&
                typeof pending.expiresAt === "number" &&
                typeof pending.redirectUri === "string" &&
                typeof pending.resource === "string" &&
                Array.isArray(pending.scopes)) {
                pushGrant({
                    clientId: pending.clientId,
                    clientName: pending.clientName,
                    codeChallenge: pending.codeChallenge,
                    consent: {
                        challenge: consentId,
                        expiresAt: pending.expiresAt,
                    },
                    grantId: `legacy-consent:${consentId}`,
                    redirectUri: pending.redirectUri,
                    resource: pending.resource,
                    scopes: pending.scopes,
                    state: pending.state,
                });
            }
        }
    }
    if (parsed.pendingAuthorizations && typeof parsed.pendingAuthorizations === "object") {
        for (const [stateId, record] of Object.entries(parsed.pendingAuthorizations)) {
            const pending = record;
            if (typeof pending.clientId === "string" &&
                typeof pending.codeChallenge === "string" &&
                typeof pending.expiresAt === "number" &&
                typeof pending.redirectUri === "string" &&
                typeof pending.resource === "string" &&
                Array.isArray(pending.scopes)) {
                pushGrant({
                    clientId: pending.clientId,
                    codeChallenge: pending.codeChallenge,
                    grantId: `legacy-authorization:${stateId}`,
                    pendingAuthorization: {
                        expiresAt: pending.expiresAt,
                        stateId,
                    },
                    redirectUri: pending.redirectUri,
                    resource: pending.resource,
                    scopes: pending.scopes,
                    state: pending.state,
                });
            }
        }
    }
    if (parsed.authorizationCodes && typeof parsed.authorizationCodes === "object") {
        for (const [code, record] of Object.entries(parsed.authorizationCodes)) {
            const authorizationCode = record;
            if (typeof authorizationCode.clientId === "string" &&
                typeof authorizationCode.codeChallenge === "string" &&
                typeof authorizationCode.expiresAt === "number" &&
                typeof authorizationCode.redirectUri === "string" &&
                typeof authorizationCode.resource === "string" &&
                Array.isArray(authorizationCode.scopes) &&
                typeof (authorizationCode.principalId ?? authorizationCode.subject) === "string" &&
                authorizationCode.upstreamTokens &&
                typeof authorizationCode.upstreamTokens === "object") {
                pushGrant({
                    authorizationCode: {
                        code,
                        expiresAt: authorizationCode.expiresAt,
                    },
                    clientId: authorizationCode.clientId,
                    codeChallenge: authorizationCode.codeChallenge,
                    grantId: `legacy-code:${code}`,
                    redirectUri: authorizationCode.redirectUri,
                    resource: authorizationCode.resource,
                    scopes: authorizationCode.scopes,
                    state: authorizationCode.state,
                    principalId: authorizationCode.principalId ?? authorizationCode.subject,
                    upstreamTokens: authorizationCode.upstreamTokens,
                });
            }
        }
    }
    if (parsed.refreshTokens && typeof parsed.refreshTokens === "object") {
        for (const [token, record] of Object.entries(parsed.refreshTokens)) {
            const refreshToken = record;
            if (typeof refreshToken.clientId === "string" &&
                typeof refreshToken.expiresAt === "number" &&
                typeof refreshToken.resource === "string" &&
                Array.isArray(refreshToken.scopes) &&
                typeof (refreshToken.principalId ?? refreshToken.subject) === "string" &&
                refreshToken.upstreamTokens &&
                typeof refreshToken.upstreamTokens === "object") {
                pushGrant({
                    clientId: refreshToken.clientId,
                    codeChallenge: "",
                    grantId: `legacy-refresh:${token}`,
                    redirectUri: "",
                    refreshToken: {
                        expiresAt: refreshToken.expiresAt,
                        token,
                    },
                    resource: refreshToken.resource,
                    scopes: refreshToken.scopes,
                    principalId: refreshToken.principalId ?? refreshToken.subject,
                    upstreamTokens: refreshToken.upstreamTokens,
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
function pruneExpiredEntries(state) {
    const now = Date.now();
    return {
        ...state,
        grants: Object.fromEntries(Object.entries(state.grants)
            .map(([grantId, grant]) => [grantId, normalizeGrant(grant)])
            .filter(([, grant]) => {
            if (!hasActiveGrantStep(grant)) {
                return false;
            }
            const expiresAt = getGrantExpiry(grant);
            return expiresAt === undefined || expiresAt > now;
        })),
    };
}
function loadState(storePath) {
    if (!storePath) {
        return createEmptyState();
    }
    try {
        const parsed = JSON.parse(readFileSync(storePath, "utf8"));
        if (parsed.version === 2 || parsed.grants !== undefined) {
            return {
                approvals: parseApprovals(parsed.approvals),
                clients: parseClients(parsed.clients),
                clientProfiles: parseClientProfiles(parsed.clientProfiles),
                grants: parseGrants(parsed.grants),
                version: 2,
            };
        }
        return migrateLegacyState(parsed);
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return createEmptyState();
        }
        throw error;
    }
}
function toPendingConsentRecord(grant) {
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
function toPendingAuthorizationRecord(grant) {
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
function toAuthorizationCodeRecord(grant) {
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
function toRefreshTokenRecord(grant) {
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
function sanitizePersistedUpstreamTokens(tokens) {
    if (!tokens) {
        return tokens;
    }
    if (typeof tokens.refresh_token !== "string" || tokens.refresh_token.length === 0) {
        return tokens;
    }
    const { access_token: _accessToken, ...persistedTokens } = tokens;
    return persistedTokens;
}
function createPersistedStateSnapshot(state) {
    return {
        ...state,
        grants: Object.fromEntries(Object.entries(state.grants).map(([grantId, grant]) => [grantId, {
                ...grant,
                upstreamTokens: sanitizePersistedUpstreamTokens(grant.upstreamTokens),
            }])),
    };
}
export function createOAuthStore(storePath) {
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
    function deleteGrant(grantId) {
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
    function findGrant(matcher) {
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
        approveClient(record) {
            const normalizedRecord = normalizeApprovalRecord(record);
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
        deleteAuthorizationCode(code) {
            const grant = findGrant((candidate) => candidate.authorizationCode?.code === code);
            if (grant) {
                deleteGrant(grant.grantId);
            }
        },
        deleteGrant,
        deletePendingAuthorization(stateId) {
            const grant = findGrant((candidate) => candidate.pendingAuthorization?.stateId === stateId);
            if (grant) {
                deleteGrant(grant.grantId);
            }
        },
        deletePendingConsent(consentId) {
            const grant = findGrant((candidate) => candidate.consent?.challenge === consentId);
            if (grant) {
                deleteGrant(grant.grantId);
            }
        },
        deleteRefreshToken(refreshToken) {
            const grant = findGrant((candidate) => candidate.refreshToken?.token === refreshToken);
            if (grant) {
                deleteGrant(grant.grantId);
            }
        },
        getAuthorizationCode(code) {
            const grant = findGrant((candidate) => candidate.authorizationCode?.code === code);
            return grant ? toAuthorizationCodeRecord(grant) : undefined;
        },
        getAuthorizationCodeGrant(code) {
            return findGrant((candidate) => candidate.authorizationCode?.code === code);
        },
        getClient(clientId) {
            return state.clients[clientId];
        },
        getClientCompatibilityProfile(clientId) {
            return state.clientProfiles[clientId];
        },
        getGrant(grantId) {
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
        getPendingAuthorization(stateId) {
            const grant = findGrant((candidate) => candidate.pendingAuthorization?.stateId === stateId);
            return grant ? toPendingAuthorizationRecord(grant) : undefined;
        },
        getPendingAuthorizationGrant(stateId) {
            return findGrant((candidate) => candidate.pendingAuthorization?.stateId === stateId);
        },
        getPendingConsent(consentId) {
            const grant = findGrant((candidate) => candidate.consent?.challenge === consentId);
            return grant ? toPendingConsentRecord(grant) : undefined;
        },
        getPendingConsentGrant(consentId) {
            return findGrant((candidate) => candidate.consent?.challenge === consentId);
        },
        getRefreshToken(refreshToken) {
            const grant = findGrant((candidate) => candidate.refreshToken?.token === refreshToken);
            return grant ? toRefreshTokenRecord(grant) : undefined;
        },
        getRefreshTokenGrant(refreshToken) {
            return findGrant((candidate) => candidate.refreshToken?.token === refreshToken);
        },
        isClientApproved(record) {
            const normalizedScopes = normalizeScopes(record.scopes);
            return state.approvals.some((approval) => (approval.clientId === record.clientId &&
                approval.resource === record.resource &&
                approval.scopes.join(" ") === normalizedScopes.join(" ")));
        },
        saveAuthorizationCode(code, record) {
            state = {
                ...state,
                grants: {
                    ...state.grants,
                    [`compat-code:${code}`]: normalizeGrant({
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
                    }),
                },
            };
            persist();
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
        saveClientCompatibilityProfile(clientId, profileId) {
            state = {
                ...state,
                clientProfiles: {
                    ...state.clientProfiles,
                    [clientId]: profileId,
                },
            };
            persist();
        },
        saveGrant(grant) {
            state = {
                ...state,
                grants: {
                    ...state.grants,
                    [grant.grantId]: normalizeGrant(grant),
                },
            };
            persist();
        },
        savePendingAuthorization(stateId, record) {
            state = {
                ...state,
                grants: {
                    ...state.grants,
                    [`compat-authorization:${stateId}`]: normalizeGrant({
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
                    }),
                },
            };
            persist();
        },
        savePendingConsent(consentId, record) {
            state = {
                ...state,
                grants: {
                    ...state.grants,
                    [`compat-consent:${consentId}`]: normalizeGrant({
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
                    }),
                },
            };
            persist();
        },
        saveRefreshToken(refreshToken, record) {
            state = {
                ...state,
                grants: {
                    ...state.grants,
                    [`compat-refresh:${refreshToken}`]: normalizeGrant({
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
                    }),
                },
            };
            persist();
        },
    };
}
