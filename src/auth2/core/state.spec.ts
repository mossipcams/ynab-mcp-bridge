import { PassThrough } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { createStateManager } from "./state.js";
import { setLoggerDestinationForTests } from "../../logger.js";
import { createInMemoryAuthStore } from "../store/authStore.js";

function createBufferedDestination() {
  const destination = new PassThrough();
  const chunks: string[] = [];

  destination.on("data", (chunk) => {
    chunks.push(chunk.toString("utf8"));
  });

  return {
    destination,
    readEntries() {
      return chunks
        .join("")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
  };
}

describe("state manager", () => {
  afterEach(() => {
    setLoggerDestinationForTests();
  });

  it("creates and consumes a single-use upstream state", () => {
    const store = createInMemoryAuthStore();
    const stateManager = createStateManager({
      createId: () => "state-1",
      now: () => 1_700_000_000_000,
      store,
      ttlMs: 600_000,
    });

    const state = stateManager.issueState("txn-1");

    expect(state).toEqual({
      expiresAt: 1_700_000_600_000,
      stateId: "state-1",
      transactionId: "txn-1",
    });
    expect(store.getPendingState("state-1")).toMatchObject({
      expiresAt: 1_700_000_600_000,
      stateId: "state-1",
      transactionId: "txn-1",
      used: false,
    });
    expect(stateManager.consumeState("state-1")).toEqual({
      stateId: "state-1",
      transactionId: "txn-1",
    });
    expect(store.getPendingState("state-1")).toMatchObject({
      used: true,
    });
  });

  it("rejects an expired state", () => {
    const store = createInMemoryAuthStore();
    let currentTime = 1_700_000_000_000;
    const stateManager = createStateManager({
      createId: () => "state-1",
      now: () => currentTime,
      store,
      ttlMs: 50,
    });

    stateManager.issueState("txn-1");
    currentTime = 1_700_000_000_100;

    expect(() => stateManager.consumeState("state-1")).toThrow("OAuth state has expired.");
  });

  it("rejects a replayed state and logs lifecycle events with fingerprints only", () => {
    const sink = createBufferedDestination();
    setLoggerDestinationForTests(sink.destination);

    const store = createInMemoryAuthStore();
    const stateManager = createStateManager({
      createId: () => "state-secret-value",
      now: () => 1_700_000_000_000,
      store,
      ttlMs: 600_000,
    });

    stateManager.issueState("txn-1");
    stateManager.consumeState("state-secret-value");

    expect(() => stateManager.consumeState("state-secret-value")).toThrow("OAuth state has already been used.");

    expect(sink.readEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "auth.state.issued",
        scope: "auth2",
        stateFingerprint: expect.any(String),
        transactionId: "txn-1",
      }),
      expect.objectContaining({
        event: "auth.state.consumed",
        scope: "auth2",
        stateFingerprint: expect.any(String),
        transactionId: "txn-1",
      }),
      expect.objectContaining({
        event: "auth.state.replay_rejected",
        scope: "auth2",
        stateFingerprint: expect.any(String),
      }),
    ]));

    const logText = JSON.stringify(sink.readEntries());
    expect(logText).not.toContain("state-secret-value");
  });
});
