import { normalizeGrant, normalizeScopes, } from "./oauthGrant.js";
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
export function normalizeApprovalRecord(record) {
    return {
        ...record,
        scopes: normalizeScopes(record.scopes),
    };
}
function isOAuthClientInformationFull(value) {
    return isRecord(value) && typeof value["client_id"] === "string";
}
function isOAuthGrantUpstreamTokens(value) {
    return isRecord(value) &&
        typeof value["token_type"] === "string";
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
function isRefreshTokenStep(value) {
    return isRecord(value) &&
        typeof value["expiresAt"] === "number" &&
        typeof value["token"] === "string";
}
function fromRecordEntries(entries) {
    const record = {};
    for (const [key, value] of entries) {
        record[key] = value;
    }
    return record;
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
function parseCompatibilityProfileId(value) {
    return value === "chatgpt" ||
        value === "claude" ||
        value === "codex" ||
        value === "generic"
        ? value
        : undefined;
}
function parseGrantRequiredFields(value) {
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
    return {
        clientId,
        codeChallenge,
        grantId,
        redirectUri,
        resource,
        scopes: scopes.filter((scope) => typeof scope === "string"),
    };
}
function buildOptionalGrantFields(value) {
    const compatibilityProfileId = parseCompatibilityProfileId(value["compatibilityProfileId"]);
    return {
        ...(isAuthorizationCodeStep(value["authorizationCode"]) ? { authorizationCode: value["authorizationCode"] } : {}),
        ...(typeof value["clientName"] === "string" ? { clientName: value["clientName"] } : {}),
        ...(compatibilityProfileId ? { compatibilityProfileId } : {}),
        ...(isConsentStep(value["consent"]) ? { consent: value["consent"] } : {}),
        ...(isPendingAuthorizationStep(value["pendingAuthorization"]) ? { pendingAuthorization: value["pendingAuthorization"] } : {}),
        ...(isRefreshTokenStep(value["refreshToken"]) ? { refreshToken: value["refreshToken"] } : {}),
        ...(typeof value["state"] === "string" ? { state: value["state"] } : {}),
        ...(typeof value["principalId"] === "string" ? { principalId: value["principalId"] } : {}),
        ...(isOAuthGrantUpstreamTokens(value["upstreamTokens"]) ? { upstreamTokens: value["upstreamTokens"] } : {}),
    };
}
function parseGrantRecord(value) {
    if (!isRecord(value)) {
        return undefined;
    }
    const requiredFields = parseGrantRequiredFields(value);
    if (!requiredFields) {
        return undefined;
    }
    return normalizeGrant({
        ...buildOptionalGrantFields(value),
        clientId: requiredFields.clientId,
        codeChallenge: requiredFields.codeChallenge,
        grantId: requiredFields.grantId,
        redirectUri: requiredFields.redirectUri,
        resource: requiredFields.resource,
        scopes: requiredFields.scopes,
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
export function loadPersistedOAuthState(parsed) {
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
    return createEmptyState();
}
export function deserializePersistedOAuthState(serialized) {
    return loadPersistedOAuthState(JSON.parse(serialized));
}
