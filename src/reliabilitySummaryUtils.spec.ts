import { describe, expect, it } from "vitest";

import { summarizeReliabilityResults } from "./reliabilitySummaryUtils.js";

describe("reliabilitySummaryUtils", () => {
  it("builds shared reliability totals, percentiles, thresholds, and grouped failures", () => {
    expect(summarizeReliabilityResults({
      results: [
        { ok: true, operation: "initialize", latencyMs: 100 },
        { ok: false, operation: "tools/list", latencyMs: 700, errorMessage: "Unexpected status 503" },
        { ok: false, operation: "tools/list", latencyMs: 750, errorMessage: "Unexpected status 503" },
        { ok: false, operation: "tools/call", latencyMs: 800, errorMessage: "socket hang up" },
      ],
      thresholds: {
        maxErrorRate: 0.5,
        maxP95LatencyMs: 750,
        maxP99LatencyMs: 900,
      },
    })).toEqual({
      errorRate: 0.75,
      failureGroups: [
        {
          count: 1,
          operation: "tools/call",
          sampleMessages: ["socket hang up"],
        },
        {
          count: 2,
          operation: "tools/list",
          sampleMessages: ["Unexpected status 503"],
        },
      ],
      failures: [
        {
          operation: "tools/list",
          latencyMs: 700,
          errorMessage: "Unexpected status 503",
        },
        {
          operation: "tools/list",
          latencyMs: 750,
          errorMessage: "Unexpected status 503",
        },
        {
          operation: "tools/call",
          latencyMs: 800,
          errorMessage: "socket hang up",
        },
      ],
      latencyMs: {
        min: 100,
        max: 800,
        average: 587.5,
        p50: 700,
        p95: 800,
        p99: 800,
      },
      operations: {
        initialize: {
          count: 1,
          errorRate: 0,
          latencyMs: {
            min: 100,
            max: 100,
            average: 100,
            p50: 100,
            p95: 100,
            p99: 100,
          },
        },
        "tools/call": {
          count: 1,
          errorRate: 1,
          latencyMs: {
            min: 800,
            max: 800,
            average: 800,
            p50: 800,
            p95: 800,
            p99: 800,
          },
        },
        "tools/list": {
          count: 2,
          errorRate: 1,
          latencyMs: {
            min: 700,
            max: 750,
            average: 725,
            p50: 700,
            p95: 750,
            p99: 750,
          },
        },
      },
      thresholds: {
        maxErrorRate: {
          actual: 0.75,
          passed: false,
          target: 0.5,
        },
        maxP95LatencyMs: {
          actual: 800,
          passed: false,
          target: 750,
        },
        maxP99LatencyMs: {
          actual: 800,
          passed: true,
          target: 900,
        },
      },
      totals: {
        attempts: 4,
        succeeded: 1,
        failed: 3,
      },
    });
  });
});
