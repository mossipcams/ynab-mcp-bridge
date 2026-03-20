import { getYnabApiRuntimeContext } from "../ynabApi.js";
import { toPlanId } from "../ynabTypes.js";
import { getErrorMessage } from "./errorUtils.js";
function getApiConfiguredPlanId(api) {
    return getYnabApiRuntimeContext(api)?.config.planId;
}
function getRuntimePlanIdOverride(api) {
    return getYnabApiRuntimeContext(api)?.runtimePlanIdOverride;
}
function setRuntimePlanIdOverride(api, planId) {
    const runtimeContext = getYnabApiRuntimeContext(api);
    if (!runtimeContext) {
        return;
    }
    runtimeContext.runtimePlanIdOverride = planId;
}
function getConfiguredPlanId(inputPlanId, api, options) {
    const explicitPlanId = toPlanId(inputPlanId);
    if (explicitPlanId) {
        return explicitPlanId;
    }
    const runtimePlanIdOverride = getRuntimePlanIdOverride(api);
    if (!options.ignoreRuntimePlanIdOverride && runtimePlanIdOverride) {
        return runtimePlanIdOverride;
    }
    if (!options.ignoreConfiguredPlanId) {
        return getApiConfiguredPlanId(api);
    }
    return undefined;
}
function pickResolvedPlanId(plans, defaultPlanId, excludedPlanIds) {
    const normalizedDefaultPlanId = toPlanId(defaultPlanId);
    if (normalizedDefaultPlanId && !excludedPlanIds.has(normalizedDefaultPlanId)) {
        return normalizedDefaultPlanId;
    }
    const remainingPlans = plans
        .map((plan) => ({ ...plan, id: toPlanId(plan.id) }))
        .filter((plan) => plan.id !== undefined)
        .filter((plan) => !excludedPlanIds.has(plan.id));
    if (remainingPlans.length === 1) {
        const [remainingPlan] = remainingPlans;
        return remainingPlan?.id;
    }
    return undefined;
}
function rememberRuntimePlanId(api, planId, inputPlanId) {
    if (!inputPlanId) {
        setRuntimePlanIdOverride(api, planId);
    }
}
function isMissingPlanError(error) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("not found") || message.includes("no entity was found");
}
async function resolvePlanId(inputPlanId, api, options = {}) {
    const excludedPlanIds = new Set(options.excludePlanIds ?? []);
    const configuredPlanId = getConfiguredPlanId(inputPlanId, api, options);
    if (configuredPlanId && !excludedPlanIds.has(configuredPlanId)) {
        return configuredPlanId;
    }
    const response = await api.plans.getPlans();
    const resolvedPlanId = pickResolvedPlanId(response.data.plans, response.data.default_plan?.id, excludedPlanIds);
    if (resolvedPlanId) {
        rememberRuntimePlanId(api, resolvedPlanId, inputPlanId);
        return resolvedPlanId;
    }
    throw new Error("No plan ID provided. Please provide a plan ID, set YNAB_PLAN_ID, or configure a default YNAB plan.");
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
            ignoreRuntimePlanIdOverride: true,
        });
        rememberRuntimePlanId(api, recoveredPlanId);
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
