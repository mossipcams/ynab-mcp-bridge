import type { ReliabilityProfile } from "./reliabilityProfiles.js";
import { summarizeReliabilityResults } from "./reliabilitySummaryUtils.js";
import type { ReliabilityOperationSummary, ReliabilityProbeResult } from "./reliabilitySummaryUtils.js";

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
    operations: Record<string, ReliabilityOperationSummary>;
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

export function createReliabilityArtifact(input: CreateReliabilityArtifactInput): ReliabilityArtifact {
  const summary = summarizeReliabilityResults({
    results: input.results,
    thresholds: input.profile.thresholds,
  });

  return {
    completedAt: input.completedAt,
    profile: input.profile,
    startedAt: input.startedAt,
    summary: {
      failed: !(
        summary.thresholds.maxErrorRate.passed &&
        summary.thresholds.maxP95LatencyMs.passed &&
        summary.thresholds.maxP99LatencyMs.passed
      ),
      ...summary,
    },
    target: input.target,
  };
}

export function compareReliabilityArtifacts(input: {
  baseline: ReliabilityArtifact;
  current: ReliabilityArtifact;
  requiredOperationAverageLatencyReductions?: Array<{
    minimumReductionRatio: number;
    operation: string;
  }>;
  tolerances: {
    maxErrorRateIncrease: number;
    maxP95LatencyIncreaseMs: number;
    maxP99LatencyIncreaseMs: number;
  };
}) {
  if (input.baseline.profile.name !== input.current.profile.name) {
    throw new Error("Cannot compare reliability artifacts from different profiles.");
  }

  if (
    input.baseline.target.mode !== input.current.target.mode ||
    input.baseline.target.url !== input.current.target.url
  ) {
    throw new Error("Cannot compare reliability artifacts for different targets.");
  }

  const regressions: Array<{
    actualIncrease: number;
    metric: "errorRate" | "p95LatencyMs" | "p99LatencyMs";
    tolerance: number;
  }> = [];
  const baselineOperations = input.baseline.summary.operations ?? {};
  const currentOperations = input.current.summary.operations ?? {};
  const requiredImprovements = (input.requiredOperationAverageLatencyReductions ?? []).map((target) => {
    const baselineOperation = baselineOperations[target.operation];
    const currentOperation = currentOperations[target.operation];
    const baselineAverage = baselineOperation?.latencyMs.average ?? Number.NaN;
    const currentAverage = currentOperation?.latencyMs.average ?? Number.NaN;
    const reductionRatio = Number.isFinite(baselineAverage) && baselineAverage > 0 && Number.isFinite(currentAverage)
      ? (baselineAverage - currentAverage) / baselineAverage
      : Number.NEGATIVE_INFINITY;

    return {
      baselineAverage,
      currentAverage,
      minimumReductionRatio: target.minimumReductionRatio,
      operation: target.operation,
      passed: reductionRatio >= target.minimumReductionRatio,
      reductionRatio,
    };
  });

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
    passed: regressions.length === 0 && requiredImprovements.every((improvement) => improvement.passed),
    regressions,
    requiredImprovements,
  };
}
