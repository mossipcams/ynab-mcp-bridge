import { describe, expect, it } from "vitest";

import { summarizeReliabilityRun } from "./reliabilityRunner.js";

describe("summarizeReliabilityRun", () => {
  it("builds summary metrics, preserves failure details, and passes when under threshold", () => {
    const summary = summarizeReliabilityRun({
      maxErrorRate: 0.5,
      results: [
        { ok: true, operation: "initialize", latencyMs: 10 },
        { ok: true, operation: "tools/list", latencyMs: 20 },
        {
          ok: false,
          operation: "tools/call",
          latencyMs: 30,
          errorMessage: "Unexpected status 500",
        },
        { ok: true, operation: "initialize", latencyMs: 40 },
        { ok: true, operation: "tools/list", latencyMs: 50 },
      ],
    });

    expect(summary).toEqual({
      passed: true,
      maxErrorRate: 0.5,
      errorRate: 0.2,
      failureGroups: [
        {
          count: 1,
          operation: "tools/call",
          sampleMessages: ["Unexpected status 500"],
        },
      ],
      totals: {
        attempts: 5,
        succeeded: 4,
        failed: 1,
      },
      latencyMs: {
        min: 10,
        max: 50,
        average: 30,
        p50: 30,
        p95: 50,
        p99: 50,
      },
      operations: {
        initialize: {
          count: 2,
          errorRate: 0,
          latencyMs: {
            min: 10,
            max: 40,
            average: 25,
            p50: 10,
            p95: 40,
            p99: 40,
          },
        },
        "tools/call": {
          count: 1,
          errorRate: 1,
          latencyMs: {
            min: 30,
            max: 30,
            average: 30,
            p50: 30,
            p95: 30,
            p99: 30,
          },
        },
        "tools/list": {
          count: 2,
          errorRate: 0,
          latencyMs: {
            min: 20,
            max: 50,
            average: 35,
            p50: 20,
            p95: 50,
            p99: 50,
          },
        },
      },
      thresholds: {
        maxErrorRate: {
          actual: 0.2,
          passed: true,
          target: 0.5,
        },
        maxP95LatencyMs: {
          actual: 50,
          passed: true,
          target: Number.POSITIVE_INFINITY,
        },
        maxP99LatencyMs: {
          actual: 50,
          passed: true,
          target: Number.POSITIVE_INFINITY,
        },
      },
      failures: [
        {
          operation: "tools/call",
          latencyMs: 30,
          errorMessage: "Unexpected status 500",
        },
      ],
    });
  });

  it("fails the run when the error rate breaches the configured threshold", () => {
    const summary = summarizeReliabilityRun({
      maxErrorRate: 0.2,
      results: [
        { ok: true, operation: "initialize", latencyMs: 10 },
        { ok: false, operation: "tools/list", latencyMs: 25, errorMessage: "socket hang up" },
        { ok: false, operation: "tools/call", latencyMs: 35, errorMessage: "Unexpected JSON-RPC error" },
        { ok: true, operation: "initialize", latencyMs: 40 },
      ],
    });

    expect(summary.passed).toBe(false);
    expect(summary.errorRate).toBe(0.5);
    expect(summary.totals).toEqual({
      attempts: 4,
      succeeded: 2,
      failed: 2,
    });
    expect(summary.failureGroups).toEqual([
      {
        count: 1,
        operation: "tools/call",
        sampleMessages: ["Unexpected JSON-RPC error"],
      },
      {
        count: 1,
        operation: "tools/list",
        sampleMessages: ["socket hang up"],
      },
    ]);
    expect(summary.thresholds.maxErrorRate).toEqual({
      actual: 0.5,
      passed: false,
      target: 0.2,
    });
    expect(summary.failures).toEqual([
      {
        operation: "tools/list",
        latencyMs: 25,
        errorMessage: "socket hang up",
      },
      {
        operation: "tools/call",
        latencyMs: 35,
        errorMessage: "Unexpected JSON-RPC error",
      },
    ]);
  });

  it("returns zeroed metrics and a passing result for an empty run", () => {
    const summary = summarizeReliabilityRun({
      maxErrorRate: 0,
      maxP95LatencyMs: 100,
      maxP99LatencyMs: 100,
      results: [],
    });

    expect(summary).toEqual({
      passed: true,
      maxErrorRate: 0,
      errorRate: 0,
      failureGroups: [],
      totals: {
        attempts: 0,
        succeeded: 0,
        failed: 0,
      },
      latencyMs: {
        min: 0,
        max: 0,
        average: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      },
      operations: {},
      thresholds: {
        maxErrorRate: {
          actual: 0,
          passed: true,
          target: 0,
        },
        maxP95LatencyMs: {
          actual: 0,
          passed: true,
          target: 100,
        },
        maxP99LatencyMs: {
          actual: 0,
          passed: true,
          target: 100,
        },
      },
      failures: [],
    });
  });
});
