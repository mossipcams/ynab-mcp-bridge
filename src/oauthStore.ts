import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

import {
  getGrantExpiry,
  hasActiveGrantStep,
  normalizeGrant,
  normalizeScopes,
  type OAuthGrant,
} from "./oauthGrant.js";

type ApprovalRecord = {
  clientId: string;
  resource: string;
  scopes: string[];
};

type LegacyPendingConsentRecord = {
  clientId: string;
  clientName?: string;
  codeChallenge: string;
  expiresAt: number;
  redirectUri: string;
  resource: string;
  scopes: string[];
  state?: string;
};

type LegacyPendingAuthorizationRecord = Omit<LegacyPendingConsentRecord, "clientName">;

type LegacyAuthorizationCodeRecord = LegacyPendingAuthorizationRecord & {
  subject: string;
  upstreamTokens: OAuthTokens;
};

type LegacyRefreshTokenRecord = {
  clientId: string;
  expiresAt: number;
  resource: string;
  scopes: string[];
  subject: string;
  upstreamTokens: OAuthTokens;
};

type LegacyPersistedOAuthState = {
  approvals?: unknown;
  authorizationCodes?: unknown;
  clients?: unknown;
  pendingAuthorizations?: unknown;
  pendingConsents?: unknown;
  refreshTokens?: unknown;
  version?: number;
};

type PersistedOAuthState = {
  approvals: ApprovalRecord[];
  clients: Record<string, OAuthClientInformationFull>;
  grants: Record<string, OAuthGrant>;
  version: 2;
};

function normalizeApprovalRecord(record: ApprovalRecord) {
  return {
    ...record,
    scopes: normalizeScopes(record.scopes),
  };
}

function createEmptyState(): PersistedOAuthState {
  return {
    approvals: [],
    clients: {},
    grants: {},
    version: 2,
  };
}

function parseApprovals(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((approval): approval is ApprovalRecord => (
      typeof approval === "object" &&
      approval !== null &&
      typeof approval.clientId === "string" &&
      typeof approval.resource === "string" &&
      Array.isArray(approval.scopes)
    ))
    .map(normalizeApprovalRecord);
}

function parseClients(value: unknown) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as Record<string, OAuthClientInformationFull>;
}

function parseGrantRecord(value: unknown): OAuthGrant | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const grant = value as Partial<OAuthGrant>;

  if (
    typeof grant.grantId !== "string" ||
    typeof grant.clientId !== "string" ||
    typeof grant.codeChallenge !== "string" ||
    typeof grant.redirectUri !== "string" ||
    typeof grant.resource !== "string" ||
    !Array.isArray(grant.scopes)
  ) {
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

function parseGrants(value: unknown) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([grantId, record]) => {
        const parsed = parseGrantRecord(record);

        if (!parsed) {
          return undefined;
        }

        return [grantId, {
          ...parsed,
          grantId,
        }] as const;
      })
      .filter((entry): entry is readonly [string, OAuthGrant] => entry !== undefined),
  );
}

function migrateLegacyState(parsed: LegacyPersistedOAuthState): PersistedOAuthState {
  const grants: Record<string, OAuthGrant> = {};

  const pushGrant = (grant: OAuthGrant) => {
    grants[grant.grantId] = normalizeGrant(grant);
  };

  if (parsed.pendingConsents && typeof parsed.pendingConsents === "object") {
    for (const [consentId, record] of Object.entries(parsed.pendingConsents)) {
      const pending = record as Partial<LegacyPendingConsentRecord>;

      if (
        typeof pending.clientId === "string" &&
        typeof pending.codeChallenge === "string" &&
        typeof pending.expiresAt === "number" &&
        typeof pending.redirectUri === "string" &&
        typeof pending.resource === "string" &&
        Array.isArray(pending.scopes)
      ) {
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
      const pending = record as Partial<LegacyPendingAuthorizationRecord>;

      if (
        typeof pending.clientId === "string" &&
        typeof pending.codeChallenge === "string" &&
        typeof pending.expiresAt === "number" &&
        typeof pending.redirectUri === "string" &&
        typeof pending.resource === "string" &&
        Array.isArray(pending.scopes)
      ) {
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
      const authorizationCode = record as Partial<LegacyAuthorizationCodeRecord>;

      if (
        typeof authorizationCode.clientId === "string" &&
        typeof authorizationCode.codeChallenge === "string" &&
        typeof authorizationCode.expiresAt === "number" &&
        typeof authorizationCode.redirectUri === "string" &&
        typeof authorizationCode.resource === "string" &&
        Array.isArray(authorizationCode.scopes) &&
        typeof authorizationCode.subject === "string" &&
        authorizationCode.upstreamTokens &&
        typeof authorizationCode.upstreamTokens === "object"
      ) {
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
          upstreamTokens: authorizationCode.upstreamTokens as OAuthTokens,
        });
      }
    }
  }

  if (parsed.refreshTokens && typeof parsed.refreshTokens === "object") {
    for (const [token, record] of Object.entries(parsed.refreshTokens)) {
      const refreshToken = record as Partial<LegacyRefreshTokenRecord>;

      if (
        typeof refreshToken.clientId === "string" &&
        typeof refreshToken.expiresAt === "number" &&
        typeof refreshToken.resource === "string" &&
        Array.isArray(refreshToken.scopes) &&
        typeof refreshToken.subject === "string" &&
        refreshToken.upstreamTokens &&
        typeof refreshToken.upstreamTokens === "object"
      ) {
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
          upstreamTokens: refreshToken.upstreamTokens as OAuthTokens,
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

function pruneExpiredEntries(state: PersistedOAuthState) {
  const now = Date.now();

  return {
    ...state,
    grants: Object.fromEntries(
      Object.entries(state.grants)
        .map(([grantId, grant]) => [grantId, normalizeGrant(grant)] as const)
        .filter(([, grant]) => {
          if (!hasActiveGrantStep(grant)) {
            return false;
          }

          const expiresAt = getGrantExpiry(grant);
          return expiresAt === undefined || expiresAt > now;
        }),
    ),
  };
}

function loadState(storePath: string | undefined): PersistedOAuthState {
  if (!storePath) {
    return createEmptyState();
  }

  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8")) as LegacyPersistedOAuthState & {
      grants?: unknown;
    };

    if (parsed.version === 2 || parsed.grants !== undefined) {
      return {
        approvals: parseApprovals(parsed.approvals),
        clients: parseClients(parsed.clients),
        grants: parseGrants(parsed.grants),
        version: 2,
      };
    }

    return migrateLegacyState(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createEmptyState();
    }

    throw error;
  }
}

export function createOAuthStore(storePath: string | undefined) {
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

  function deleteGrant(grantId: string) {
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

  function findGrant(matcher: (grant: OAuthGrant) => boolean) {
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
    approveClient(record: ApprovalRecord) {
      const normalizedRecord = normalizeApprovalRecord(record);

      if (!state.approvals.some((approval) => (
        approval.clientId === normalizedRecord.clientId &&
        approval.resource === normalizedRecord.resource &&
        approval.scopes.join(" ") === normalizedRecord.scopes.join(" ")
      ))) {
        state = {
          ...state,
          approvals: [...state.approvals, normalizedRecord],
        };
        persist();
      }
    },
    deleteGrant,
    getAuthorizationCodeGrant(code: string) {
      return findGrant((candidate) => candidate.authorizationCode?.code === code);
    },
    getClient(clientId: string) {
      return state.clients[clientId];
    },
    getPendingAuthorizationGrant(stateId: string) {
      return findGrant((candidate) => candidate.pendingAuthorization?.stateId === stateId);
    },
    getPendingConsentGrant(consentId: string) {
      return findGrant((candidate) => (
        candidate.consent?.challenge === consentId ||
        candidate.consentApprovalReplay?.challenge === consentId
      ));
    },
    getRefreshTokenGrant(refreshToken: string) {
      return findGrant((candidate) => candidate.refreshToken?.token === refreshToken);
    },
    isClientApproved(record: ApprovalRecord) {
      const normalizedScopes = normalizeScopes(record.scopes);

      return state.approvals.some((approval) => (
        approval.clientId === record.clientId &&
        approval.resource === record.resource &&
        approval.scopes.join(" ") === normalizedScopes.join(" ")
      ));
    },
    saveClient(client: OAuthClientInformationFull) {
      state = {
        ...state,
        clients: {
          ...state.clients,
          [client.client_id]: client,
        },
      };
      persist();
    },
    saveGrant(grant: OAuthGrant) {
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
