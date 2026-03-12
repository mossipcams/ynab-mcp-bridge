import { getYnabApiRuntimeContext } from "../ynabApi.js";
import { getErrorMessage } from "./errorUtils.js";

export function getPlanId(inputPlanId?: string, configuredPlanId?: string): string {
  const planId = inputPlanId?.trim() || configuredPlanId?.trim() || "";
  if (!planId) {
    throw new Error("No plan ID provided. Please provide a plan ID or set YNAB_PLAN_ID.");
  }
  return planId;
}

type PlanResolverApi = {
  plans: {
    getPlans: () => Promise<{
      data: {
        plans: Array<{ id: string }>;
        default_plan?: { id: string } | null;
      };
    }>;
  };
};

type ResolvePlanIdOptions = {
  excludePlanIds?: string[];
  ignoreConfiguredPlanId?: boolean;
  ignoreRuntimePlanIdOverride?: boolean;
};

function getApiConfiguredPlanId(api: object) {
  return getYnabApiRuntimeContext(api)?.config.planId?.trim();
}

function getRuntimePlanIdOverride(api: object) {
  return getYnabApiRuntimeContext(api)?.runtimePlanIdOverride?.trim();
}

function setRuntimePlanIdOverride(api: object, planId: string) {
  const runtimeContext = getYnabApiRuntimeContext(api);

  if (!runtimeContext) {
    return;
  }

  runtimeContext.runtimePlanIdOverride = planId;
}

function getConfiguredPlanId(inputPlanId: string | undefined, api: object, options: ResolvePlanIdOptions) {
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

function pickResolvedPlanId(
  plans: Array<{ id: string }>,
  defaultPlanId: string | undefined,
  excludedPlanIds: Set<string>,
) {
  if (defaultPlanId && !excludedPlanIds.has(defaultPlanId)) {
    return defaultPlanId;
  }

  const remainingPlans = plans.filter((plan) => !excludedPlanIds.has(plan.id));

  if (remainingPlans.length === 1) {
    return remainingPlans[0].id;
  }

  return undefined;
}

function rememberRuntimePlanId(api: object, planId: string, inputPlanId?: string) {
  if (!inputPlanId) {
    setRuntimePlanIdOverride(api, planId);
  }
}

function isMissingPlanError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("not found") || message.includes("no entity was found");
}

export async function resolvePlanId(
  inputPlanId: string | undefined,
  api: PlanResolverApi,
  options: ResolvePlanIdOptions = {},
): Promise<string> {
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

  throw new Error(
    "No plan ID provided. Please provide a plan ID, set YNAB_PLAN_ID, or configure a default YNAB plan.",
  );
}

export async function withResolvedPlan<T>(
  inputPlanId: string | undefined,
  api: PlanResolverApi,
  operation: (planId: string) => Promise<T>,
) {
  const planId = await resolvePlanId(inputPlanId, api);

  try {
    return await operation(planId);
  } catch (error) {
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

export function toTextResult(payload: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify(payload, null, 2),
    }],
  };
}

export function toErrorResult(error: unknown) {
  return {
    isError: true,
    ...toTextResult({
      success: false,
      error: getErrorMessage(error),
    }),
  };
}
