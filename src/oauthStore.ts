import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

import type { ClientProfileId } from "./clientProfiles/types.js";
import {
  createAuthorizationCodeCompatibilityGrant,
  createPendingAuthorizationCompatibilityGrant,
  createPendingConsentCompatibilityGrant,
  createRefreshTokenCompatibilityGrant,
} from "./oauthCompatibilityGrants.js";
import {
  getGrantExpiry,
  hasActiveGrantStep,
  normalizeGrant,
  normalizeScopes,
  type OAuthGrant,
  type OAuthGrantInput,
} from "./oauthGrant.js";
import {
  toAuthorizationCodeRecord,
  toPendingAuthorizationRecord,
  toPendingConsentRecord,
  toRefreshTokenRecord,
  type AuthorizationCodeRecord,
  type PendingAuthorizationRecord,
  type PendingConsentRecord,
  type RefreshTokenRecord,
} from "./oauthGrantViews.js";
import {
  deserializePersistedOAuthState,
  loadPersistedOAuthState,
  normalizeApprovalRecord,
  type ApprovalRecord,
  type PersistedOAuthState,
} from "./oauthStoreMigration.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
    return loadPersistedOAuthState(undefined);
  }

  try {
    return deserializePersistedOAuthState(readFileSync(storePath, "utf8"));
  } catch (error) {
    if (isRecord(error) && error["code"] === "ENOENT") {
      return loadPersistedOAuthState(undefined);
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

  function saveCompatibilityGrant(grant: OAuthGrant) {
    state = {
      ...state,
      grants: {
        ...state.grants,
        [grant.grantId]: grant,
      },
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
    deleteAuthorizationCode(code: string) {
      const grant = findGrant((candidate) => candidate.authorizationCode?.code === code);

      if (grant) {
        deleteGrant(grant.grantId);
      }
    },
    deleteGrant,
    deletePendingAuthorization(stateId: string) {
      const grant = findGrant((candidate) => candidate.pendingAuthorization?.stateId === stateId);

      if (grant) {
        deleteGrant(grant.grantId);
      }
    },
    deletePendingConsent(consentId: string) {
      const grant = findGrant((candidate) => candidate.consent?.challenge === consentId);

      if (grant) {
        deleteGrant(grant.grantId);
      }
    },
    deleteRefreshToken(refreshToken: string) {
      const grant = findGrant((candidate) => candidate.refreshToken?.token === refreshToken);

      if (grant) {
        deleteGrant(grant.grantId);
      }
    },
    getAuthorizationCode(code: string) {
      const grant = findGrant((candidate) => candidate.authorizationCode?.code === code);
      return grant ? toAuthorizationCodeRecord(grant) : undefined;
    },
    getAuthorizationCodeGrant(code: string) {
      return findGrant((candidate) => candidate.authorizationCode?.code === code);
    },
    getClient(clientId: string) {
      return state.clients[clientId];
    },
    getClientCompatibilityProfile(clientId: string) {
      return state.clientProfiles[clientId];
    },
    getGrant(grantId: string) {
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
    getPendingAuthorization(stateId: string) {
      const grant = findGrant((candidate) => candidate.pendingAuthorization?.stateId === stateId);
      return grant ? toPendingAuthorizationRecord(grant) : undefined;
    },
    getPendingAuthorizationGrant(stateId: string) {
      return findGrant((candidate) => candidate.pendingAuthorization?.stateId === stateId);
    },
    getPendingConsent(consentId: string) {
      const grant = findGrant((candidate) => candidate.consent?.challenge === consentId);
      return grant ? toPendingConsentRecord(grant) : undefined;
    },
    getPendingConsentGrant(consentId: string) {
      return findGrant((candidate) => candidate.consent?.challenge === consentId);
    },
    getRefreshToken(refreshToken: string) {
      const grant = findGrant((candidate) => candidate.refreshToken?.token === refreshToken);
      return grant ? toRefreshTokenRecord(grant) : undefined;
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
    saveAuthorizationCode(code: string, record: AuthorizationCodeRecord) {
      saveCompatibilityGrant(createAuthorizationCodeCompatibilityGrant(code, record));
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
    saveClientCompatibilityProfile(clientId: string, profileId: ClientProfileId) {
      state = {
        ...state,
        clientProfiles: {
          ...state.clientProfiles,
          [clientId]: profileId,
        },
      };
      persist();
    },
    saveGrant(grant: OAuthGrantInput) {
      state = {
        ...state,
        grants: {
          ...state.grants,
          [grant.grantId]: normalizeGrant(grant),
        },
      };
      persist();
    },
    savePendingAuthorization(stateId: string, record: PendingAuthorizationRecord) {
      saveCompatibilityGrant(createPendingAuthorizationCompatibilityGrant(stateId, record));
    },
    savePendingConsent(consentId: string, record: PendingConsentRecord) {
      saveCompatibilityGrant(createPendingConsentCompatibilityGrant(consentId, record));
    },
    saveRefreshToken(refreshToken: string, record: RefreshTokenRecord) {
      saveCompatibilityGrant(createRefreshTokenCompatibilityGrant(refreshToken, record));
    },
  };
}
