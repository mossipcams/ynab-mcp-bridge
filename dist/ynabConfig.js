function readOptionalValue(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}
function hasValue(value) {
    return readOptionalValue(value) !== undefined;
}
function getBackendReadiness(env) {
    const ynabApiToken = hasValue(env["YNAB_API_TOKEN"]);
    const ynabPlanIdConfigured = hasValue(env["YNAB_PLAN_ID"]);
    return {
        status: ynabApiToken ? "ok" : "misconfigured",
        planResolution: ynabPlanIdConfigured ? "configured" : "dynamic",
        checks: {
            ynabApiToken,
            ynabPlanIdConfigured,
        },
    };
}
export function assertBackendEnvironment(env) {
    const readiness = getBackendReadiness(env);
    if (!readiness.checks.ynabApiToken) {
        throw new Error("YNAB_API_TOKEN is required.");
    }
    return readiness;
}
export function readYnabConfig(env) {
    return {
        apiToken: readOptionalValue(env["YNAB_API_TOKEN"]) ?? "",
        ...(readOptionalValue(env["YNAB_PLAN_ID"]) ? { planId: readOptionalValue(env["YNAB_PLAN_ID"]) } : {}),
    };
}
export function assertYnabConfig(config) {
    const apiToken = readOptionalValue(config?.apiToken);
    if (!apiToken) {
        throw new Error("YNAB config is required.");
    }
    return {
        apiToken,
        ...(readOptionalValue(config?.planId) ? { planId: readOptionalValue(config?.planId) } : {}),
    };
}
