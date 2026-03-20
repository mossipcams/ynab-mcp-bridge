import { getYnabApiRuntimeContext } from "../ynabApi.js";
import type { PlanId } from "../ynabTypes.js";
import { toPlanId } from "../ynabTypes.js";
import { getErrorMessage } from "./errorUtils.js";

type PlanResolverApi = {
  plans: {
    getPlans: () => Promise<{
      data: {
        plans: Array<{ id: string }>;
        default_plan?: { id: string };
      };
    }>;
  };
};

type ResolvePlanIdOptions = {
  excludePlanIds?: readonly PlanId[] | undefined;
  ignoreConfiguredPlanId?: boolean;
  ignoreRuntimePlanIdOverride?: boolean;
};

function getApiConfiguredPlanId(api: object) {
  return getYnabApiRuntimeContext(api)?.config.planId;
}

function getRuntimePlanIdOverride(api: object) {
  return getYnabApiRuntimeContext(api)?.runtimePlanIdOverride;
}

function setRuntimePlanIdOverride(api: object, planId: PlanId) {
  const runtimeContext = getYnabApiRuntimeContext(api);

  if (!runtimeContext) {
    return;
  }

  runtimeContext.runtimePlanIdOverride = planId;
}

function getConfiguredPlanId(
  inputPlanId: string | undefined,
  api: object,
  options: ResolvePlanIdOptions,
): PlanId | undefined {
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

function pickResolvedPlanId(
  plans: Array<{ id: string }>,
  defaultPlanId: string | undefined,
  excludedPlanIds: Set<string>,
) {
  const normalizedDefaultPlanId = toPlanId(defaultPlanId);

  if (normalizedDefaultPlanId && !excludedPlanIds.has(normalizedDefaultPlanId)) {
    return normalizedDefaultPlanId;
  }

  const remainingPlans = plans
    .map((plan) => ({ ...plan, id: toPlanId(plan.id) }))
    .filter((plan): plan is { id: PlanId } => plan.id !== undefined)
    .filter((plan) => !excludedPlanIds.has(plan.id));

  if (remainingPlans.length === 1) {
    const [remainingPlan] = remainingPlans;
    return remainingPlan?.id;
  }

  return undefined;
}

function rememberRuntimePlanId(api: object, planId: PlanId, inputPlanId?: string) {
  if (!inputPlanId) {
    setRuntimePlanIdOverride(api, planId);
  }
}

function isMissingPlanError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("not found") || message.includes("no entity was found");
}

async function resolvePlanId(
  inputPlanId: string | undefined,
  api: PlanResolverApi,
  options: ResolvePlanIdOptions = {},
): Promise<PlanId> {
  const excludedPlanIds = new Set<PlanId>(options.excludePlanIds ?? []);
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
  operation: (planId: PlanId) => Promise<T>,
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

type OutputFormat = "compact" | "pretty";

function serializePayload(payload: unknown, format: OutputFormat) {
  return format === "pretty"
    ? JSON.stringify(payload, null, 2)
    : JSON.stringify(payload);
}

export function toTextResult(payload: unknown, format: OutputFormat = "compact") {
  return {
    content: [{
      type: "text" as const,
      text: serializePayload(payload, format),
    }],
  };
}

export function toErrorResult(error: unknown, format: OutputFormat = "compact") {
  return {
    isError: true,
    ...toTextResult({
      success: false,
      error: getErrorMessage(error),
    }, format),
  };
}
