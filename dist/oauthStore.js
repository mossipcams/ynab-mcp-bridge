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
    return typeof value["clientId"] === "string" &&
        typeof value["resource"] === "string" &&
        Array.isArray(value["scopes"]);
}
function normalizeApprovalRecord(record) {
    return {
        ...record,
        scopes: normalizeScopes(record.scopes),
    };
}
function isOAuthGrantUpstreamTokens(value) {
    return isRecord(value) &&
        typeof value["token_type"] === "string" &&
        (value["access_token"] === undefined || typeof value["access_token"] === "string") &&
        (value["expires_in"] === undefined || typeof value["expires_in"] === "number") &&
        (value["refresh_token"] === undefined || typeof value["refresh_token"] === "string") &&
        (value["scope"] === undefined || typeof value["scope"] === "string");
}
function isOAuthClientInformationFull(value) {
    return isRecord(value) && typeof value["client_id"] === "string";
}
function isAuthorizationCodeStep(value) {
    return isRecord(value) &&
        typeof value["code"] === "string" &&
        typeof value["expiresAt"] === "number";
}
function isConsentStep(value) {
    return isRecord(value) &&
        typeof value["challenge"] === "string" &&
        typeof value["expiresAt"] === "number";
}
function isPendingAuthorizationStep(value) {
    return isRecord(value) &&
        typeof value["expiresAt"] === "number" &&
        typeof value["stateId"] === "string";
}
function fromRecordEntries(entries) {
    const record = {};
    for (const [key, value] of entries) {
        record[key] = value;
    }
    return record;
}
function isRefreshTokenStep(value) {
    return isRecord(value) &&
        typeof value["expiresAt"] === "number" &&
        typeof value["token"] === "string";
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
    if (!isRecord(value)) {
        return {};
    }
    return fromRecordEntries(Object.entries(value).filter((entry) => isOAuthClientInformationFull(entry[1])));
}
function parseClientProfiles(value) {
    if (!isRecord(value)) {
        return {};
    }
    return fromRecordEntries(Object.entries(value).filter((entry) => (entry[1] === "chatgpt" ||
        entry[1] === "claude" ||
        entry[1] === "codex" ||
        entry[1] === "generic")));
}
// This legacy persistence parser intentionally validates several optional grant steps in one place.
// eslint-disable-next-line sonarjs/cognitive-complexity
function parseGrantRecord(value) {
    if (!isRecord(value)) {
        return undefined;
    }
    const grantId = value["grantId"];
    const clientId = value["clientId"];
    const codeChallenge = value["codeChallenge"];
    const redirectUri = value["redirectUri"];
    const resource = value["resource"];
    const scopes = value["scopes"];
    if (typeof grantId !== "string" ||
        typeof clientId !== "string" ||
        typeof codeChallenge !== "string" ||
        typeof redirectUri !== "string" ||
        typeof resource !== "string" ||
        !Array.isArray(scopes)) {
        return undefined;
    }
    return normalizeGrant({
        ...(isAuthorizationCodeStep(value["authorizationCode"]) ? { authorizationCode: value["authorizationCode"] } : {}),
        clientId,
        ...(typeof value["clientName"] === "string" ? { clientName: value["clientName"] } : {}),
        ...(value["compatibilityProfileId"] === "chatgpt" ||
            value["compatibilityProfileId"] === "claude" ||
            value["compatibilityProfileId"] === "codex" ||
            value["compatibilityProfileId"] === "generic"
            ? { compatibilityProfileId: value["compatibilityProfileId"] }
            : {}),
        codeChallenge,
        ...(isConsentStep(value["consent"]) ? { consent: value["consent"] } : {}),
        grantId,
        ...(isPendingAuthorizationStep(value["pendingAuthorization"]) ? { pendingAuthorization: value["pendingAuthorization"] } : {}),
        redirectUri,
        ...(isRefreshTokenStep(value["refreshToken"]) ? { refreshToken: value["refreshToken"] } : {}),
        resource,
        scopes: scopes.filter((scope) => typeof scope === "string"),
        ...(typeof value["state"] === "string" ? { state: value["state"] } : {}),
        ...(typeof value["principalId"] === "string" ? { principalId: value["principalId"] } : {}),
        ...(typeof value["subject"] === "string" ? { subject: value["subject"] } : {}),
        ...(isOAuthGrantUpstreamTokens(value["upstreamTokens"]) ? { upstreamTokens: value["upstreamTokens"] } : {}),
    });
}
function parseGrants(value) {
    if (!value || typeof value !== "object") {
        return {};
    }
    return fromRecordEntries(Object.entries(value)
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
function toLegacyPendingConsentGrant(consentId, record) {
    if (!isRecord(record)) {
        return undefined;
    }
    const clientId = record["clientId"];
    const codeChallenge = record["codeChallenge"];
    const expiresAt = record["expiresAt"];
    const redirectUri = record["redirectUri"];
    const resource = record["resource"];
    const scopes = record["scopes"];
    if (typeof clientId !== "string" ||
        typeof codeChallenge !== "string" ||
        typeof expiresAt !== "number" ||
        typeof redirectUri !== "string" ||
        typeof resource !== "string" ||
        !Array.isArray(scopes)) {
        return undefined;
    }
    return {
        clientId,
        ...(typeof record["clientName"] === "string" ? { clientName: record["clientName"] } : {}),
        codeChallenge,
        consent: {
            challenge: consentId,
            expiresAt,
        },
        grantId: `legacy-consent:${consentId}`,
        redirectUri,
        resource,
        scopes: scopes.filter((scope) => typeof scope === "string"),
        ...(typeof record["state"] === "string" ? { state: record["state"] } : {}),
    };
}
function toLegacyPendingAuthorizationGrant(stateId, record) {
    if (!isRecord(record)) {
        return undefined;
    }
    const clientId = record["clientId"];
    const codeChallenge = record["codeChallenge"];
    const expiresAt = record["expiresAt"];
    const redirectUri = record["redirectUri"];
    const resource = record["resource"];
    const scopes = record["scopes"];
    if (typeof clientId !== "string" ||
        typeof codeChallenge !== "string" ||
        typeof expiresAt !== "number" ||
        typeof redirectUri !== "string" ||
        typeof resource !== "string" ||
        !Array.isArray(scopes)) {
        return undefined;
    }
    return {
        clientId,
        codeChallenge,
        grantId: `legacy-authorization:${stateId}`,
        pendingAuthorization: {
            expiresAt,
            stateId,
        },
        redirectUri,
        resource,
        scopes: scopes.filter((scope) => typeof scope === "string"),
        ...(typeof record["state"] === "string" ? { state: record["state"] } : {}),
    };
}
function migrateLegacyGrantRecords(records, toGrant, pushGrant) {
    if (!records || typeof records !== "object") {
        return;
    }
    for (const [recordId, record] of Object.entries(records)) {
        const grant = toGrant(recordId, record);
        if (grant) {
            pushGrant(grant);
        }
    }
}
function toLegacyAuthorizationCodeGrant(code, record) {
    if (!isRecord(record)) {
        return undefined;
    }
    const clientId = record["clientId"];
    const codeChallenge = record["codeChallenge"];
    const expiresAt = record["expiresAt"];
    const redirectUri = record["redirectUri"];
    const resource = record["resource"];
    const scopes = record["scopes"];
    const principalId = typeof record["principalId"] === "string"
        ? record["principalId"]
        : typeof record["subject"] === "string"
            ? record["subject"]
            : undefined;
    const upstreamTokens = record["upstreamTokens"];
    if (typeof clientId !== "string" ||
        typeof codeChallenge !== "string" ||
        typeof expiresAt !== "number" ||
        typeof redirectUri !== "string" ||
        typeof resource !== "string" ||
        !Array.isArray(scopes) ||
        typeof principalId !== "string" ||
        !isOAuthGrantUpstreamTokens(upstreamTokens)) {
        return undefined;
    }
    return {
        authorizationCode: {
            code,
            expiresAt,
        },
        clientId,
        codeChallenge,
        grantId: `legacy-code:${code}`,
        redirectUri,
        resource,
        scopes: scopes.filter((scope) => typeof scope === "string"),
        ...(typeof record["state"] === "string" ? { state: record["state"] } : {}),
        principalId,
        upstreamTokens,
    };
}
function toLegacyRefreshTokenGrant(token, record) {
    if (!isRecord(record)) {
        return undefined;
    }
    const clientId = record["clientId"];
    const expiresAt = record["expiresAt"];
    const resource = record["resource"];
    const scopes = record["scopes"];
    const principalId = typeof record["principalId"] === "string"
        ? record["principalId"]
        : typeof record["subject"] === "string"
            ? record["subject"]
            : undefined;
    const upstreamTokens = record["upstreamTokens"];
    if (typeof clientId !== "string" ||
        typeof expiresAt !== "number" ||
        typeof resource !== "string" ||
        !Array.isArray(scopes) ||
        typeof principalId !== "string" ||
        !isOAuthGrantUpstreamTokens(upstreamTokens)) {
        return undefined;
    }
    return {
        clientId,
        codeChallenge: "",
        grantId: `legacy-refresh:${token}`,
        redirectUri: "",
        refreshToken: {
            expiresAt,
            token,
        },
        resource,
        scopes: scopes.filter((scope) => typeof scope === "string"),
        principalId,
        upstreamTokens,
    };
}
function migrateLegacyState(parsed) {
    const grants = {};
    const pushGrant = (grant) => {
        grants[grant.grantId] = normalizeGrant(grant);
    };
    migrateLegacyGrantRecords(parsed.pendingConsents, toLegacyPendingConsentGrant, pushGrant);
    migrateLegacyGrantRecords(parsed.pendingAuthorizations, toLegacyPendingAuthorizationGrant, pushGrant);
    migrateLegacyGrantRecords(parsed.authorizationCodes, toLegacyAuthorizationCodeGrant, pushGrant);
    migrateLegacyGrantRecords(parsed.refreshTokens, toLegacyRefreshTokenGrant, pushGrant);
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
        if (!isRecord(parsed)) {
            return createEmptyState();
        }
        if (parsed["version"] === 2 || parsed["grants"] !== undefined) {
            return {
                approvals: parseApprovals(parsed["approvals"]),
                clients: parseClients(parsed["clients"]),
                clientProfiles: parseClientProfiles(parsed["clientProfiles"]),
                grants: parseGrants(parsed["grants"]),
                version: 2,
            };
        }
        return migrateLegacyState({
            approvals: parsed["approvals"],
            authorizationCodes: parsed["authorizationCodes"],
            clients: parsed["clients"],
            pendingAuthorizations: parsed["pendingAuthorizations"],
            pendingConsents: parsed["pendingConsents"],
            refreshTokens: parsed["refreshTokens"],
            ...(typeof parsed["version"] === "number" ? { version: parsed["version"] } : {}),
        });
    }
    catch (error) {
        if (isRecord(error) && error["code"] === "ENOENT") {
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
