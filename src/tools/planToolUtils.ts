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
    getPlans: (...args: any[]) => Promise<{
      data: {
        plans: Array<{ id: string }>;
        default_plan?: { id: string };
      };
    }>;
  };
};

type ResolvePlanIdOptions = {
  excludePlanIds?: string[];
  ignoreConfiguredPlanId?: boolean;
  ignoreRuntimePlanIdOverride?: boolean;
};

type CompactResultItemOptions<T extends Record<string, unknown>> = {
  emptyStringKeys?: Array<keyof T>;
  omitWhenEqual?: Partial<T>;
};

type TransactionLike = {
  account_id?: string | null;
  account_name?: string | null;
  amount: number;
  approved?: boolean;
  category_id?: string | null;
  category_name?: string | null;
  cleared?: string | null;
  date: string;
  flag_name?: string | null;
  id: string;
  import_id?: string | null;
  memo?: string | null;
  payee_id?: string | null;
  payee_name?: string | null;
  transfer_account_id?: string | null;
  transfer_transaction_id?: string | null;
};

type TransactionProjectionOptions = {
  includeFullDetails?: boolean;
};

export const DEFAULT_COMPACT_LIST_LIMIT = 50;

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

export function compactResultItem<T extends Record<string, unknown>>(
  item: T,
  options: CompactResultItemOptions<T> = {},
) {
  const emptyStringKeys = new Set<keyof T>(options.emptyStringKeys ?? []);

  return Object.fromEntries(
    Object.entries(item).filter(([rawKey, value]) => {
      const key = rawKey as keyof T;

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
    }),
  ) as Partial<T>;
}

export function buildCompactListPayload<T>(
  key: string,
  items: T[],
  limit = items.length,
) {
  const normalizedLimit = Math.max(0, Math.min(limit, items.length));
  const boundedItems = items.slice(0, normalizedLimit);

  return {
    [key]: boundedItems,
    returned_count: boundedItems.length,
    total_count: items.length,
    has_more: items.length > boundedItems.length,
  } as Record<string, unknown>;
}

export function normalizeListLimit(limit: number | undefined, defaultLimit = DEFAULT_COMPACT_LIST_LIMIT) {
  if (limit === undefined) {
    return defaultLimit;
  }

  if (!Number.isFinite(limit)) {
    return defaultLimit;
  }

  return Math.max(1, Math.floor(limit));
}

export function projectTransaction(
  transaction: TransactionLike,
  options: TransactionProjectionOptions = {},
) {
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

export function toTextResult(payload: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify(payload),
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
