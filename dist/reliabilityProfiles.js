const RELIABILITY_PROFILES = {
    smoke: {
        description: "Fast local HTTP smoke probe for regressions.",
        name: "smoke",
        runner: "smoke",
        smoke: {
            concurrency: 1,
            requestCount: 5,
        },
        thresholds: {
            abortOnFail: false,
            maxErrorRate: 0,
            maxP95LatencyMs: 250,
            maxP99LatencyMs: 500,
        },
    },
    baseline: {
        description: "Average-load baseline profile for repeatable regression checks.",
        load: {
            durationSeconds: 60,
            maxVus: 10,
            preAllocatedVus: 5,
            targetVus: 5,
            warmupSeconds: 10,
        },
        name: "baseline",
        runner: "load",
        thresholds: {
            abortOnFail: false,
            maxErrorRate: 0.01,
            maxP95LatencyMs: 500,
            maxP99LatencyMs: 1000,
        },
    },
    stress: {
        description: "Higher sustained concurrency to expose overload behavior.",
        load: {
            durationSeconds: 120,
            maxVus: 40,
            preAllocatedVus: 20,
            targetVus: 20,
            warmupSeconds: 15,
        },
        name: "stress",
        runner: "load",
        thresholds: {
            abortOnFail: true,
            maxErrorRate: 0.03,
            maxP95LatencyMs: 1200,
            maxP99LatencyMs: 2000,
        },
    },
    spike: {
        description: "Short sudden burst to test reaction to abrupt traffic jumps.",
        load: {
            durationSeconds: 45,
            maxVus: 60,
            preAllocatedVus: 10,
            targetVus: 30,
            warmupSeconds: 5,
        },
        name: "spike",
        runner: "load",
        thresholds: {
            abortOnFail: true,
            maxErrorRate: 0.05,
            maxP95LatencyMs: 1500,
            maxP99LatencyMs: 2500,
        },
    },
    soak: {
        description: "Longer steady-state run to catch degradation over time.",
        load: {
            durationSeconds: 900,
            maxVus: 12,
            preAllocatedVus: 6,
            targetVus: 6,
            warmupSeconds: 30,
        },
        name: "soak",
        runner: "load",
        thresholds: {
            abortOnFail: false,
            maxErrorRate: 0.01,
            maxP95LatencyMs: 750,
            maxP99LatencyMs: 1500,
        },
    },
};
export function listReliabilityProfiles() {
    return Object.values(RELIABILITY_PROFILES);
}
export function parseReliabilityProfileName(value) {
    if (value in RELIABILITY_PROFILES) {
        return value;
    }
    throw new Error(`Unknown reliability profile: ${value}`);
}
export function getReliabilityProfile(name) {
    return RELIABILITY_PROFILES[name];
}
