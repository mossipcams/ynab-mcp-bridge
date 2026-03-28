import { getErrorMessage } from "./errorUtils.js";

function _getPlanId(inputPlanId?: string, configuredPlanId?: string): string {
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
        default_plan?: { id: string };
      };
    }>;
  };
};

const inFlightPlanResolutionSymbol = Symbol("ynabInFlightPlanResolution");

type ResolvePlanIdOptions = {
  configuredPlanId?: string;
  excludePlanIds?: string[];
  ignoreConfiguredPlanId?: boolean;
};

type PlanResolverApiWithInFlightResolutions = PlanResolverApi & {
  [inFlightPlanResolutionSymbol]?: Map<string, Promise<string>>;
};

function getConfiguredPlanId(inputPlanId: string | undefined, options: ResolvePlanIdOptions) {
  const explicitPlanId = inputPlanId?.trim();

  if (explicitPlanId) {
    return explicitPlanId;
  }

  if (!options.ignoreConfiguredPlanId) {
    return options.configuredPlanId?.trim() ?? "";
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
    return remainingPlans[0]?.id;
  }

  return undefined;
}

function isMissingPlanError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("not found") || message.includes("no entity was found");
}

function getInFlightPlanResolutionStore(api: PlanResolverApiWithInFlightResolutions) {
  if (api[inFlightPlanResolutionSymbol]) {
    return api[inFlightPlanResolutionSymbol];
  }

  const store = new Map<string, Promise<string>>();
  Object.defineProperty(api, inFlightPlanResolutionSymbol, {
    configurable: false,
    enumerable: false,
    value: store,
    writable: false,
  });

  return store;
}

function getPlanResolutionCacheKey(options: ResolvePlanIdOptions) {
  const excludedPlanIds = [...(options.excludePlanIds ?? [])].sort();
  return [
    options.ignoreConfiguredPlanId === true ? "ignore-configured" : "allow-configured",
    excludedPlanIds.join(","),
  ].join(":");
}

async function resolvePlanId(
  inputPlanId: string | undefined,
  api: PlanResolverApi,
  options: ResolvePlanIdOptions = {},
): Promise<string> {
  const excludedPlanIds = new Set(options.excludePlanIds ?? []);
  const configuredPlanId = getConfiguredPlanId(inputPlanId, options);

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

    throw new Error(
      "No plan ID provided. Please provide a plan ID, set YNAB_PLAN_ID, or configure a default YNAB plan.",
    );
  })();

  inFlightStore.set(cacheKey, pendingResolution);

  try {
    return await pendingResolution;
  } finally {
    inFlightStore.delete(cacheKey);
  }
}

export async function withResolvedPlan<T>(
  inputPlanId: string | undefined,
  api: PlanResolverApi,
  operation: (planId: string) => Promise<T>,
  options: ResolvePlanIdOptions = {},
) {
  const planId = await resolvePlanId(inputPlanId, api, options);

  try {
    return await operation(planId);
  } catch (error) {
    if (inputPlanId || !isMissingPlanError(error)) {
      throw error;
    }

    const recoveredPlanId = await resolvePlanId(undefined, api, {
      ...(options.configuredPlanId ? { configuredPlanId: options.configuredPlanId } : {}),
      excludePlanIds: [planId],
      ignoreConfiguredPlanId: true,
    });

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
