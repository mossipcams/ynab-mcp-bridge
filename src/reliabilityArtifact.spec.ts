import { describe, expect, it } from "vitest";

import { compareReliabilityArtifacts, createReliabilityArtifact } from "./reliabilityArtifact.js";
import { getReliabilityProfile } from "./reliabilityProfiles.js";

describe("reliability artifacts", () => {
  it("builds machine-readable summaries with percentile metrics, threshold states, and grouped failures", () => {
    const artifact = createReliabilityArtifact({
      completedAt: "2026-03-24T12:05:00.000Z",
      profile: getReliabilityProfile("baseline"),
      results: [
        { ok: true, operation: "initialize", latencyMs: 100 },
        { ok: true, operation: "tools/list", latencyMs: 200 },
        { ok: false, operation: "tools/list", latencyMs: 700, errorMessage: "Unexpected status 503" },
        { ok: false, operation: "tools/call:ynab_get_mcp_version", latencyMs: 800, errorMessage: "socket hang up" },
      ],
      startedAt: "2026-03-24T12:00:00.000Z",
      target: {
        mode: "url",
        url: "http://127.0.0.1:3000/mcp",
      },
    });

    expect(artifact.summary.totals).toEqual({
      attempts: 4,
      failed: 2,
      succeeded: 2,
    });
    expect(artifact.summary.latencyMs).toEqual({
      average: 450,
      max: 800,
      min: 100,
      p50: 200,
      p95: 800,
      p99: 800,
    });
    expect(artifact.summary.thresholds).toEqual({
      maxErrorRate: {
        actual: 0.5,
        passed: false,
        target: 0.01,
      },
      maxP95LatencyMs: {
        actual: 800,
        passed: false,
        target: 500,
      },
      maxP99LatencyMs: {
        actual: 800,
        passed: true,
        target: 1000,
      },
    });
    expect(artifact.summary.failureGroups).toEqual([
      {
        count: 1,
        operation: "tools/call:ynab_get_mcp_version",
        sampleMessages: ["socket hang up"],
      },
      {
        count: 1,
        operation: "tools/list",
        sampleMessages: ["Unexpected status 503"],
      },
    ]);
  });

  it("compares a run against a baseline artifact and flags regressions in error rate and percentile latency", () => {
    const baseline = createReliabilityArtifact({
      completedAt: "2026-03-24T11:05:00.000Z",
      profile: getReliabilityProfile("baseline"),
      results: [
        { ok: true, operation: "initialize", latencyMs: 90 },
        { ok: true, operation: "tools/list", latencyMs: 120 },
        { ok: true, operation: "tools/call:ynab_get_mcp_version", latencyMs: 150 },
        { ok: true, operation: "initialize", latencyMs: 200 },
      ],
      startedAt: "2026-03-24T11:00:00.000Z",
      target: {
        mode: "url",
        url: "http://127.0.0.1:3000/mcp",
      },
    });

    const current = createReliabilityArtifact({
      completedAt: "2026-03-24T12:05:00.000Z",
      profile: getReliabilityProfile("baseline"),
      results: [
        { ok: true, operation: "initialize", latencyMs: 120 },
        { ok: false, operation: "tools/list", latencyMs: 500, errorMessage: "Unexpected status 500" },
        { ok: true, operation: "tools/call:ynab_get_mcp_version", latencyMs: 650 },
        { ok: true, operation: "initialize", latencyMs: 700 },
      ],
      startedAt: "2026-03-24T12:00:00.000Z",
      target: {
        mode: "url",
        url: "http://127.0.0.1:3000/mcp",
      },
    });

    expect(compareReliabilityArtifacts({
      baseline,
      current,
      tolerances: {
        maxErrorRateIncrease: 0.05,
        maxP95LatencyIncreaseMs: 250,
        maxP99LatencyIncreaseMs: 250,
      },
    })).toEqual({
      passed: false,
      regressions: [
        {
          actualIncrease: 0.25,
          metric: "errorRate",
          tolerance: 0.05,
        },
        {
          actualIncrease: 500,
          metric: "p95LatencyMs",
          tolerance: 250,
        },
        {
          actualIncrease: 500,
          metric: "p99LatencyMs",
          tolerance: 250,
        },
      ],
    });
  });

  it("rejects baseline comparisons when the profile or target does not match", () => {
    const baseline = createReliabilityArtifact({
      completedAt: "2026-03-24T11:05:00.000Z",
      profile: getReliabilityProfile("baseline"),
      results: [
        { ok: true, operation: "initialize", latencyMs: 90 },
      ],
      startedAt: "2026-03-24T11:00:00.000Z",
      target: {
        mode: "url",
        url: "http://127.0.0.1:3000/mcp",
      },
    });

    const mismatchedProfile = createReliabilityArtifact({
      completedAt: "2026-03-24T12:05:00.000Z",
      profile: getReliabilityProfile("stress"),
      results: [
        { ok: true, operation: "initialize", latencyMs: 120 },
      ],
      startedAt: "2026-03-24T12:00:00.000Z",
      target: {
        mode: "url",
        url: "http://127.0.0.1:3000/mcp",
      },
    });

    const mismatchedTarget = createReliabilityArtifact({
      completedAt: "2026-03-24T12:05:00.000Z",
      profile: getReliabilityProfile("baseline"),
      results: [
        { ok: true, operation: "initialize", latencyMs: 120 },
      ],
      startedAt: "2026-03-24T12:00:00.000Z",
      target: {
        mode: "url",
        url: "http://127.0.0.1:4100/mcp",
      },
    });

    expect(() => compareReliabilityArtifacts({
      baseline,
      current: mismatchedProfile,
      tolerances: {
        maxErrorRateIncrease: 0.05,
        maxP95LatencyIncreaseMs: 250,
        maxP99LatencyIncreaseMs: 250,
      },
    })).toThrow("Cannot compare reliability artifacts from different profiles.");

    expect(() => compareReliabilityArtifacts({
      baseline,
      current: mismatchedTarget,
      tolerances: {
        maxErrorRateIncrease: 0.05,
        maxP95LatencyIncreaseMs: 250,
        maxP99LatencyIncreaseMs: 250,
      },
    })).toThrow("Cannot compare reliability artifacts for different targets.");
  });
});
