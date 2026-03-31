import { fingerprintAuthValue, logAuthEvent } from "../logging/authEvents.js";
import type { AuthStore } from "../store/authStore.js";

type CreateStateManagerOptions = {
  createId: () => string;
  now: () => number;
  store: AuthStore;
  ttlMs: number;
};

export function createStateManager(options: CreateStateManagerOptions) {
  function issueState(transactionId: string) {
    const stateId = options.createId();
    const expiresAt = options.now() + options.ttlMs;

    const record = options.store.savePendingState({
      expiresAt,
      stateId,
      transactionId,
      used: false,
    });

    logAuthEvent("auth.state.issued", {
      expiresAt,
      stateFingerprint: fingerprintAuthValue(stateId),
      transactionId,
    });

    return {
      expiresAt: record.expiresAt,
      stateId: record.stateId,
      transactionId: record.transactionId,
    };
  }

  function consumeState(stateId: string) {
    const record = options.store.getPendingState(stateId);
    const stateFingerprint = fingerprintAuthValue(stateId);

    if (!record) {
      logAuthEvent("auth.state.unknown_rejected", {
        stateFingerprint,
      });
      throw new Error("Unknown OAuth state.");
    }

    if (record.used) {
      logAuthEvent("auth.state.replay_rejected", {
        stateFingerprint,
        transactionId: record.transactionId,
      });
      throw new Error("OAuth state has already been used.");
    }

    if (record.expiresAt <= options.now()) {
      logAuthEvent("auth.state.expired_rejected", {
        expiresAt: record.expiresAt,
        stateFingerprint,
        transactionId: record.transactionId,
      });
      throw new Error("OAuth state has expired.");
    }

    options.store.updatePendingState(stateId, {
      used: true,
      usedAt: options.now(),
    });

    logAuthEvent("auth.state.consumed", {
      stateFingerprint,
      transactionId: record.transactionId,
    });

    return {
      stateId: record.stateId,
      transactionId: record.transactionId,
    };
  }

  return {
    consumeState,
    issueState,
  };
}
