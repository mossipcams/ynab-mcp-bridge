import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getGrantExpiry, hasActiveGrantStep, normalizeGrant, normalizeScopes, } from "./oauthGrant.js";
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
        grants: {},
        version: 2,
    };
}
function parseApprovals(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((approval) => (typeof approval === "object" &&
        approval !== null &&
        typeof approval.clientId === "string" &&
        typeof approval.resource === "string" &&
        Array.isArray(approval.scopes)))
        .map(normalizeApprovalRecord);
}
function parseClients(value) {
    if (!value || typeof value !== "object") {
        return {};
    }
    return value;
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
        codeChallenge: grant.codeChallenge,
        consent: grant.consent,
        consentApprovalReplay: grant.consentApprovalReplay,
        grantId: grant.grantId,
        pendingAuthorization: grant.pendingAuthorization,
        redirectUri: grant.redirectUri,
        refreshToken: grant.refreshToken,
        resource: grant.resource,
        scopes: grant.scopes,
        state: grant.state,
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
                typeof authorizationCode.subject === "string" &&
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
                    subject: authorizationCode.subject,
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
                typeof refreshToken.subject === "string" &&
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
                    subject: refreshToken.subject,
                    upstreamTokens: refreshToken.upstreamTokens,
                });
            }
        }
    }
    return {
        approvals: parseApprovals(parsed.approvals),
        clients: parseClients(parsed.clients),
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
        deleteGrant,
        getAuthorizationCodeGrant(code) {
            return findGrant((candidate) => candidate.authorizationCode?.code === code);
        },
        getClient(clientId) {
            return state.clients[clientId];
        },
        getPendingAuthorizationGrant(stateId) {
            return findGrant((candidate) => candidate.pendingAuthorization?.stateId === stateId);
        },
        getPendingConsentGrant(consentId) {
            return findGrant((candidate) => (candidate.consent?.challenge === consentId ||
                candidate.consentApprovalReplay?.challenge === consentId));
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
    };
}
