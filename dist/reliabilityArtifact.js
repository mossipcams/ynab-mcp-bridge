import { summarizeReliabilityResults } from "./reliabilitySummaryUtils.js";
export function createReliabilityArtifact(input) {
    const summary = summarizeReliabilityResults({
        results: input.results,
        thresholds: input.profile.thresholds,
    });
    return {
        completedAt: input.completedAt,
        profile: input.profile,
        startedAt: input.startedAt,
        summary: {
            failed: !(summary.thresholds.maxErrorRate.passed &&
                summary.thresholds.maxP95LatencyMs.passed &&
                summary.thresholds.maxP99LatencyMs.passed),
            ...summary,
        },
        target: input.target,
    };
}
export function compareReliabilityArtifacts(input) {
    if (input.baseline.profile.name !== input.current.profile.name) {
        throw new Error("Cannot compare reliability artifacts from different profiles.");
    }
    if (input.baseline.target.mode !== input.current.target.mode ||
        input.baseline.target.url !== input.current.target.url) {
        throw new Error("Cannot compare reliability artifacts for different targets.");
    }
    const regressions = [];
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
