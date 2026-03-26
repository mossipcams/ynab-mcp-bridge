import { summarizeReliabilityResults } from "./reliabilitySummaryUtils.js";
export function summarizeReliabilityRun(input) {
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
