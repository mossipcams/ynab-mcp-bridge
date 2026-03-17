import { getYnabApiRuntimeContext } from "../ynabApi.js";
import { getErrorMessage } from "./errorUtils.js";
export function getPlanId(inputPlanId, configuredPlanId) {
    const planId = inputPlanId?.trim() || configuredPlanId?.trim() || "";
    if (!planId) {
        throw new Error("No plan ID provided. Please provide a plan ID or set YNAB_PLAN_ID.");
    }
    return planId;
}
export const DEFAULT_COMPACT_LIST_LIMIT = 50;
function getApiConfiguredPlanId(api) {
    return getYnabApiRuntimeContext(api)?.config.planId?.trim();
}
function getRuntimePlanIdOverride(api) {
    return getYnabApiRuntimeContext(api)?.runtimePlanIdOverride?.trim();
}
function setRuntimePlanIdOverride(api, planId) {
    const runtimeContext = getYnabApiRuntimeContext(api);
    if (!runtimeContext) {
        return;
    }
    runtimeContext.runtimePlanIdOverride = planId;
}
function getConfiguredPlanId(inputPlanId, api, options) {
    const explicitPlanId = inputPlanId?.trim();
    if (explicitPlanId) {
        return explicitPlanId;
    }
    const runtimePlanIdOverride = getRuntimePlanIdOverride(api);
    if (!options.ignoreRuntimePlanIdOverride && runtimePlanIdOverride) {
        return runtimePlanIdOverride;
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
        return remainingPlans[0].id;
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
export async function resolvePlanId(inputPlanId, api, options = {}) {
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
export function compactResultItem(item, options = {}) {
    const emptyStringKeys = new Set(options.emptyStringKeys ?? []);
    return Object.fromEntries(Object.entries(item).filter(([rawKey, value]) => {
        const key = rawKey;
        if (value === undefined || value === null) {
            return false;
        }
        if (emptyStringKeys.has(key) && value === "") {
            return false;
        }
        if (Object.prototype.hasOwnProperty.call(options.omitWhenEqual ?? {}, key) && options.omitWhenEqual?.[key] === value) {
            return false;
        }
        return true;
    }));
}
export function buildCompactListPayload(key, items, limit = items.length) {
    const normalizedLimit = Math.max(0, Math.min(limit, items.length));
    const boundedItems = items.slice(0, normalizedLimit);
    return {
        [key]: boundedItems,
        returned_count: boundedItems.length,
        total_count: items.length,
        has_more: items.length > boundedItems.length,
    };
}
export function normalizeListLimit(limit, defaultLimit = DEFAULT_COMPACT_LIST_LIMIT) {
    if (limit === undefined) {
        return defaultLimit;
    }
    if (!Number.isFinite(limit)) {
        return defaultLimit;
    }
    return Math.max(1, Math.floor(limit));
}
export function projectTransaction(transaction, options = {}) {
    const baseProjection = {
        id: transaction.id,
        date: transaction.date,
        amount: (transaction.amount / 1000).toFixed(2),
        payee_name: transaction.payee_name,
        category_name: transaction.category_name,
        account_name: transaction.account_name,
    };
    if (!options.includeFullDetails) {
        return compactResultItem(baseProjection);
    }
    return compactResultItem({
        ...baseProjection,
        account_id: transaction.account_id,
        payee_id: transaction.payee_id,
        category_id: transaction.category_id,
        transfer_account_id: transaction.transfer_account_id,
        transfer_transaction_id: transaction.transfer_transaction_id,
        approved: transaction.approved,
        cleared: transaction.cleared,
        memo: transaction.memo,
        flag_name: transaction.flag_name,
        import_id: transaction.import_id,
    }, {
        emptyStringKeys: ["memo", "flag_name", "import_id"],
    });
}
function toPipeDelimited(value, prefix = "") {
    if (value === null || value === undefined)
        return `${prefix}|`;
    if (Array.isArray(value))
        return value.map((item, i) => toPipeDelimited(item, `${prefix}.${i}`)).join("\n");
    if (typeof value === "object")
        return Object.entries(value).map(([k, v]) => toPipeDelimited(v, prefix ? `${prefix}.${k}` : k)).join("\n");
    return `${prefix}|${String(value)}`;
}
export function toTextResult(payload) {
    return {
        content: [{
                type: "text",
                text: toPipeDelimited(payload),
            }],
    };
}
export function toErrorResult(error) {
    return {
        isError: true,
        ...toTextResult({
            success: false,
            error: getErrorMessage(error),
        }),
    };
}
