export type ReliabilityProbeResult = {
  ok: boolean;
  operation: string;
  latencyMs: number;
  errorMessage?: string;
};

type ReliabilityThresholdTargets = {
  maxErrorRate: number;
  maxP95LatencyMs: number;
  maxP99LatencyMs: number;
};

type ReliabilityThresholdSummary = {
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

type ReliabilityFailureGroup = {
  count: number;
  operation: string;
  sampleMessages: string[];
};

type ReliabilityFailureRecord = {
  operation: string;
  latencyMs: number;
  errorMessage: string;
};

type ReliabilityLatencySummary = {
  min: number;
  max: number;
  average: number;
  p50: number;
  p95: number;
  p99: number;
};

export type ReliabilityOperationSummary = {
  count: number;
  errorRate: number;
  latencyMs: ReliabilityLatencySummary;
};

type ReliabilityTotalsSummary = {
  attempts: number;
  succeeded: number;
  failed: number;
};

export type ReliabilitySummaryMetrics = {
  errorRate: number;
  failureGroups: ReliabilityFailureGroup[];
  failures: ReliabilityFailureRecord[];
  latencyMs: ReliabilityLatencySummary;
  operations: Record<string, ReliabilityOperationSummary>;
  thresholds: ReliabilityThresholdSummary;
  totals: ReliabilityTotalsSummary;
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
  const groups = new Map<string, {
    count: number;
    sampleMessages: string[];
  }>();

  for (const result of results) {
    if (result.ok) {
      continue;
    }

    const existing = groups.get(result.operation) ?? {
      count: 0,
      sampleMessages: [],
    };
    existing.count += 1;

    const message = result.errorMessage ?? "Unknown reliability probe failure";
    if (!existing.sampleMessages.includes(message)) {
      existing.sampleMessages.push(message);
    }

    groups.set(result.operation, existing);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([operation, details]) => ({
      count: details.count,
      operation,
      sampleMessages: details.sampleMessages,
    }));
}

function summarizeOperation(results: ReliabilityProbeResult[]): ReliabilityOperationSummary {
  const attempts = results.length;
  const failed = results.filter((result) => !result.ok).length;
  const errorRate = attempts === 0 ? 0 : failed / attempts;
  const latencies = results.map((result) => result.latencyMs);
  const totalLatency = latencies.reduce((sum, value) => sum + value, 0);
  const p95 = percentile(latencies, 0.95);
  const p99 = percentile(latencies, 0.99);

  return {
    count: attempts,
    errorRate,
    latencyMs: {
      min: latencies.length === 0 ? 0 : Math.min(...latencies),
      max: latencies.length === 0 ? 0 : Math.max(...latencies),
      average: latencies.length === 0 ? 0 : totalLatency / latencies.length,
      p50: percentile(latencies, 0.5),
      p95,
      p99,
    },
  };
}

function summarizeReliabilityOperations(results: ReliabilityProbeResult[]) {
  const operationResults = new Map<string, ReliabilityProbeResult[]>();

  for (const result of results) {
    const existing = operationResults.get(result.operation) ?? [];
    existing.push(result);
    operationResults.set(result.operation, existing);
  }

  return Object.fromEntries(
    [...operationResults.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([operation, operationEntries]) => [operation, summarizeOperation(operationEntries)]),
  );
}

export function summarizeReliabilityResults(input: {
  results: ReliabilityProbeResult[];
  thresholds: ReliabilityThresholdTargets;
}): ReliabilitySummaryMetrics {
  const attempts = input.results.length;
  const succeeded = input.results.filter((result) => result.ok).length;
  const failed = attempts - succeeded;
  const errorRate = attempts === 0 ? 0 : failed / attempts;
  const latencies = input.results.map((result) => result.latencyMs);
  const totalLatency = latencies.reduce((sum, value) => sum + value, 0);
  const p95 = percentile(latencies, 0.95);
  const p99 = percentile(latencies, 0.99);

  return {
    errorRate,
    failureGroups: createFailureGroups(input.results),
    failures: input.results
      .filter((result) => !result.ok)
      .map((result) => ({
        operation: result.operation,
        latencyMs: result.latencyMs,
        errorMessage: result.errorMessage ?? "Unknown reliability probe failure",
      })),
    latencyMs: {
      min: latencies.length === 0 ? 0 : Math.min(...latencies),
      max: latencies.length === 0 ? 0 : Math.max(...latencies),
      average: latencies.length === 0 ? 0 : totalLatency / latencies.length,
      p50: percentile(latencies, 0.5),
      p95,
      p99,
    },
    operations: summarizeReliabilityOperations(input.results),
    thresholds: {
      maxErrorRate: {
        actual: errorRate,
        passed: errorRate <= input.thresholds.maxErrorRate,
        target: input.thresholds.maxErrorRate,
      },
      maxP95LatencyMs: {
        actual: p95,
        passed: p95 <= input.thresholds.maxP95LatencyMs,
        target: input.thresholds.maxP95LatencyMs,
      },
      maxP99LatencyMs: {
        actual: p99,
        passed: p99 <= input.thresholds.maxP99LatencyMs,
        target: input.thresholds.maxP99LatencyMs,
      },
    },
    totals: {
      attempts,
      succeeded,
      failed,
    },
  };
}
