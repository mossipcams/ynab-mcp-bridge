import { getConfiguredPlanId } from "./ynabApi.js";

import { withResolvedPlan as withExplicitResolvedPlan } from "./tools/planToolUtils.js";

export type { OutputFormat } from "./tools/planToolUtils.js";
export { toErrorResult, toProseResult, toTextResult } from "./tools/planToolUtils.js";

export async function withResolvedPlan<T>(
  inputPlanId: string | undefined,
  api: Parameters<typeof withExplicitResolvedPlan>[1],
  operation: (planId: string) => Promise<T>,
) {
  const configuredPlanId = getConfiguredPlanId(api);

  return withExplicitResolvedPlan(inputPlanId, api, operation, {
    ...(configuredPlanId ? { configuredPlanId } : {}),
  });
}
