import { summarizeReliabilityResults } from "./reliabilitySummaryUtils.js";
import type { ReliabilityProbeResult } from "./reliabilitySummaryUtils.js";

export type { ReliabilityProbeResult } from "./reliabilitySummaryUtils.js";

export type SummarizeReliabilityRunInput = {
  maxErrorRate: number;
  maxP95LatencyMs?: number | undefined;
  maxP99LatencyMs?: number | undefined;
  results: ReliabilityProbeResult[];
};

export type RunReliabilityProbesInput = {
  concurrency: number;
  count: number;
  probe: (index: number) => Promise<ReliabilityProbeResult[]>;
};

export type ReliabilityRunSummary = {
  passed: boolean;
  maxErrorRate: number;
  errorRate: number;
  failureGroups: Array<{
    count: number;
    operation: string;
    sampleMessages: string[];
  }>;
  totals: {
    attempts: number;
    succeeded: number;
    failed: number;
  };
  latencyMs: {
    min: number;
    max: number;
    average: number;
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
  failures: Array<{
    operation: string;
    latencyMs: number;
    errorMessage: string;
  }>;
};

export function summarizeReliabilityRun(input: SummarizeReliabilityRunInput): ReliabilityRunSummary {
  const summary = summarizeReliabilityResults({
    results: input.results,
    thresholds: {
      maxErrorRate: input.maxErrorRate,
      maxP95LatencyMs: input.maxP95LatencyMs ?? Number.POSITIVE_INFINITY,
      maxP99LatencyMs: input.maxP99LatencyMs ?? Number.POSITIVE_INFINITY,
    },
  });

  return {
    passed: summary.thresholds.maxErrorRate.passed &&
      summary.thresholds.maxP95LatencyMs.passed &&
      summary.thresholds.maxP99LatencyMs.passed,
    maxErrorRate: input.maxErrorRate,
    ...summary,
  };
}

export async function runReliabilityProbes(input: RunReliabilityProbesInput) {
  const workerCount = Math.max(1, Math.min(input.count, input.concurrency));
  const buckets: ReliabilityProbeResult[][] = Array.from({ length: input.count }, () => []);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= input.count) {
        return;
      }

      buckets[currentIndex] = await input.probe(currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      await worker();
    }),
  );

  return buckets.flat();
}
