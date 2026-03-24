import type { ReliabilityProbeResult } from "./reliabilityRunner.js";
import type { ReliabilityProfile } from "./reliabilityProfiles.js";

export type ReliabilityArtifact = {
  completedAt: string;
  profile: ReliabilityProfile;
  startedAt: string;
  summary: {
    failed: boolean;
    failureGroups: Array<{
      count: number;
      operation: string;
      sampleMessages: string[];
    }>;
    failures: Array<{
      errorMessage: string;
      latencyMs: number;
      operation: string;
    }>;
    latencyMs: {
      average: number;
      max: number;
      min: number;
      p50: number;
      p95: number;
      p99: number;
    };
    thresholds: {
      maxErrorRate: {
        actual: number;
        passed: boolean;
        target: number;
      };
      maxP95LatencyMs: {
        actual: number;
        passed: boolean;
        target: number;
      };
      maxP99LatencyMs: {
        actual: number;
        passed: boolean;
        target: number;
      };
    };
    totals: {
      attempts: number;
      failed: number;
      succeeded: number;
    };
  };
  target:
    | {
        mode: "local";
        url: string;
      }
    | {
        mode: "url";
        url: string;
      };
};

type CreateReliabilityArtifactInput = Omit<ReliabilityArtifact, "summary"> & {
  results: ReliabilityProbeResult[];
};

function percentile(values: number[], ratio: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index] ?? 0;
}

function createFailureGroups(results: ReliabilityProbeResult[]) {
  const failures = results.filter((result) => !result.ok);
  const groups = new Map<string, { count: number; sampleMessages: string[] }>();

  for (const failure of failures) {
    const existing = groups.get(failure.operation) ?? {
      count: 0,
      sampleMessages: [],
    };
    existing.count += 1;

    const message = failure.errorMessage ?? "Unknown reliability probe failure";
    if (!existing.sampleMessages.includes(message)) {
      existing.sampleMessages.push(message);
    }

    groups.set(failure.operation, existing);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([operation, group]) => ({
      count: group.count,
      operation,
      sampleMessages: group.sampleMessages,
    }));
}

export function createReliabilityArtifact(input: CreateReliabilityArtifactInput): ReliabilityArtifact {
  const attempts = input.results.length;
  const succeeded = input.results.filter((result) => result.ok).length;
  const failed = attempts - succeeded;
  const errorRate = attempts === 0 ? 0 : failed / attempts;
  const latencies = input.results.map((result) => result.latencyMs);
  const totalLatency = latencies.reduce((sum, value) => sum + value, 0);
  const p95 = percentile(latencies, 0.95);
  const p99 = percentile(latencies, 0.99);

  return {
    completedAt: input.completedAt,
    profile: input.profile,
    startedAt: input.startedAt,
    summary: {
      failed: (
        errorRate > input.profile.thresholds.maxErrorRate ||
        p95 > input.profile.thresholds.maxP95LatencyMs ||
        p99 > input.profile.thresholds.maxP99LatencyMs
      ),
      failureGroups: createFailureGroups(input.results),
      failures: input.results
        .filter((result) => !result.ok)
        .map((result) => ({
          errorMessage: result.errorMessage ?? "Unknown reliability probe failure",
          latencyMs: result.latencyMs,
          operation: result.operation,
        })),
      latencyMs: {
        average: latencies.length === 0 ? 0 : totalLatency / latencies.length,
        max: latencies.length === 0 ? 0 : Math.max(...latencies),
        min: latencies.length === 0 ? 0 : Math.min(...latencies),
        p50: percentile(latencies, 0.5),
        p95,
        p99,
      },
      thresholds: {
        maxErrorRate: {
          actual: errorRate,
          passed: errorRate <= input.profile.thresholds.maxErrorRate,
          target: input.profile.thresholds.maxErrorRate,
        },
        maxP95LatencyMs: {
          actual: p95,
          passed: p95 <= input.profile.thresholds.maxP95LatencyMs,
          target: input.profile.thresholds.maxP95LatencyMs,
        },
        maxP99LatencyMs: {
          actual: p99,
          passed: p99 <= input.profile.thresholds.maxP99LatencyMs,
          target: input.profile.thresholds.maxP99LatencyMs,
        },
      },
      totals: {
        attempts,
        failed,
        succeeded,
      },
    },
    target: input.target,
  };
}

export function compareReliabilityArtifacts(input: {
  baseline: ReliabilityArtifact;
  current: ReliabilityArtifact;
  tolerances: {
    maxErrorRateIncrease: number;
    maxP95LatencyIncreaseMs: number;
    maxP99LatencyIncreaseMs: number;
  };
}) {
  if (input.baseline.profile.name !== input.current.profile.name) {
    throw new Error("Cannot compare reliability artifacts from different profiles.");
  }

  if (input.baseline.target.url !== input.current.target.url) {
    throw new Error("Cannot compare reliability artifacts for different targets.");
  }

  const regressions: Array<{
    actualIncrease: number;
    metric: "errorRate" | "p95LatencyMs" | "p99LatencyMs";
    tolerance: number;
  }> = [];

  const errorRateIncrease = input.current.summary.thresholds.maxErrorRate.actual -
    input.baseline.summary.thresholds.maxErrorRate.actual;
  if (errorRateIncrease > input.tolerances.maxErrorRateIncrease) {
    regressions.push({
      actualIncrease: errorRateIncrease,
      metric: "errorRate",
      tolerance: input.tolerances.maxErrorRateIncrease,
    });
  }

  const p95Increase = input.current.summary.latencyMs.p95 - input.baseline.summary.latencyMs.p95;
  if (p95Increase > input.tolerances.maxP95LatencyIncreaseMs) {
    regressions.push({
      actualIncrease: p95Increase,
      metric: "p95LatencyMs",
      tolerance: input.tolerances.maxP95LatencyIncreaseMs,
    });
  }

  const p99Increase = input.current.summary.latencyMs.p99 - input.baseline.summary.latencyMs.p99;
  if (p99Increase > input.tolerances.maxP99LatencyIncreaseMs) {
    regressions.push({
      actualIncrease: p99Increase,
      metric: "p99LatencyMs",
      tolerance: input.tolerances.maxP99LatencyIncreaseMs,
    });
  }

  return {
    passed: regressions.length === 0,
    regressions,
  };
}
