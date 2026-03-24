function percentile(values, ratio) {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
    return sorted[index] ?? 0;
}
function createFailureGroups(results) {
    const groups = new Map();
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
export function summarizeReliabilityRun(input) {
    const attempts = input.results.length;
    const succeeded = input.results.filter((result) => result.ok).length;
    const failed = attempts - succeeded;
    const errorRate = attempts === 0 ? 0 : failed / attempts;
    const latencies = input.results.map((result) => result.latencyMs);
    const totalLatency = latencies.reduce((sum, value) => sum + value, 0);
    const p95 = percentile(latencies, 0.95);
    const p99 = percentile(latencies, 0.99);
    const maxP95LatencyMs = input.maxP95LatencyMs ?? Number.POSITIVE_INFINITY;
    const maxP99LatencyMs = input.maxP99LatencyMs ?? Number.POSITIVE_INFINITY;
    const thresholds = {
        maxErrorRate: {
            actual: errorRate,
            passed: errorRate <= input.maxErrorRate,
            target: input.maxErrorRate,
        },
        maxP95LatencyMs: {
            actual: p95,
            passed: p95 <= maxP95LatencyMs,
            target: maxP95LatencyMs,
        },
        maxP99LatencyMs: {
            actual: p99,
            passed: p99 <= maxP99LatencyMs,
            target: maxP99LatencyMs,
        },
    };
    return {
        passed: thresholds.maxErrorRate.passed &&
            thresholds.maxP95LatencyMs.passed &&
            thresholds.maxP99LatencyMs.passed,
        maxErrorRate: input.maxErrorRate,
        errorRate,
        failureGroups: createFailureGroups(input.results),
        totals: {
            attempts,
            succeeded,
            failed,
        },
        latencyMs: {
            min: latencies.length === 0 ? 0 : Math.min(...latencies),
            max: latencies.length === 0 ? 0 : Math.max(...latencies),
            average: latencies.length === 0 ? 0 : totalLatency / latencies.length,
            p50: percentile(latencies, 0.5),
            p95,
            p99,
        },
        thresholds,
        failures: input.results
            .filter((result) => !result.ok)
            .map((result) => ({
            operation: result.operation,
            latencyMs: result.latencyMs,
            errorMessage: result.errorMessage ?? "Unknown reliability probe failure",
        })),
    };
}
export async function runReliabilityProbes(input) {
    const workerCount = Math.max(1, Math.min(input.count, input.concurrency));
    const buckets = Array.from({ length: input.count }, () => []);
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
    await Promise.all(Array.from({ length: workerCount }, async () => {
        await worker();
    }));
    return buckets.flat();
}
