import { getYnabApiRuntimeContext } from "../ynabApi.js";
import { getErrorMessage } from "./errorUtils.js";
function _getPlanId(inputPlanId, configuredPlanId) {
    const planId = inputPlanId?.trim() || configuredPlanId?.trim() || "";
    if (!planId) {
        throw new Error("No plan ID provided. Please provide a plan ID or set YNAB_PLAN_ID.");
    }
    return planId;
}
const inFlightPlanResolutionSymbol = Symbol("ynabInFlightPlanResolution");
function getApiConfiguredPlanId(api) {
    return getYnabApiRuntimeContext(api)?.config.planId?.trim();
}
function getConfiguredPlanId(inputPlanId, api, options) {
    const explicitPlanId = inputPlanId?.trim();
    if (explicitPlanId) {
        return explicitPlanId;
    }
    if (!options.ignoreConfiguredPlanId) {
        return getApiConfiguredPlanId(api) ?? "";
    }
    return "";
}
function pickResolvedPlanId(plans, defaultPlanId, excludedPlanIds) {
    if (defaultPlanId && !excludedPlanIds.has(defaultPlanId)) {
        return defaultPlanId;
    }
    const remainingPlans = plans.filter((plan) => !excludedPlanIds.has(plan.id));
    if (remainingPlans.length === 1) {
        return remainingPlans[0]?.id;
    }
    return undefined;
}
function isMissingPlanError(error) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("not found") || message.includes("no entity was found");
}
function getInFlightPlanResolutionStore(api) {
    const target = api;
    if (target[inFlightPlanResolutionSymbol]) {
        return target[inFlightPlanResolutionSymbol];
    }
    const store = new Map();
    Object.defineProperty(target, inFlightPlanResolutionSymbol, {
        configurable: false,
        enumerable: false,
        value: store,
        writable: false,
    });
    return store;
}
function getPlanResolutionCacheKey(options) {
    const excludedPlanIds = [...(options.excludePlanIds ?? [])].sort();
    return [
        options.ignoreConfiguredPlanId === true ? "ignore-configured" : "allow-configured",
        excludedPlanIds.join(","),
    ].join(":");
}
async function resolvePlanId(inputPlanId, api, options = {}) {
    const excludedPlanIds = new Set(options.excludePlanIds ?? []);
    const configuredPlanId = getConfiguredPlanId(inputPlanId, api, options);
    if (configuredPlanId && !excludedPlanIds.has(configuredPlanId)) {
        return configuredPlanId;
    }
    const inFlightStore = getInFlightPlanResolutionStore(api);
    const cacheKey = getPlanResolutionCacheKey(options);
    const inFlightResolution = inFlightStore.get(cacheKey);
    if (inFlightResolution) {
        return await inFlightResolution;
    }
    const pendingResolution = (async () => {
        const response = await api.plans.getPlans();
        const resolvedPlanId = pickResolvedPlanId(response.data.plans, response.data.default_plan?.id, excludedPlanIds);
        if (resolvedPlanId) {
            return resolvedPlanId;
        }
        throw new Error("No plan ID provided. Please provide a plan ID, set YNAB_PLAN_ID, or configure a default YNAB plan.");
    })();
    inFlightStore.set(cacheKey, pendingResolution);
    try {
        return await pendingResolution;
    }
    finally {
        inFlightStore.delete(cacheKey);
    }
}
export async function withResolvedPlan(inputPlanId, api, operation) {
    const planId = await resolvePlanId(inputPlanId, api);
    try {
        return await operation(planId);
    }
    catch (error) {
        if (inputPlanId || !isMissingPlanError(error)) {
            throw error;
        }
        const recoveredPlanId = await resolvePlanId(undefined, api, {
            excludePlanIds: [planId],
            ignoreConfiguredPlanId: true,
        });
        return operation(recoveredPlanId);
    }
}
function serializePayload(payload, format) {
    return format === "pretty"
        ? JSON.stringify(payload, null, 2)
        : JSON.stringify(payload);
}
export function toTextResult(payload, format = "compact") {
    return {
        content: [{
                type: "text",
                text: serializePayload(payload, format),
            }],
    };
}
export function toErrorResult(error, format = "compact") {
    return {
        isError: true,
        ...toTextResult({
            success: false,
            error: getErrorMessage(error),
        }, format),
    };
}
