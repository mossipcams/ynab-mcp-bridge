import { getConfiguredPlanId } from "../ynabApi.js";

import { withResolvedPlan as withExplicitResolvedPlan } from "./planToolUtils.js";

export type { OutputFormat } from "./planToolUtils.js";
export { toErrorResult, toProseResult, toTextResult } from "./planToolUtils.js";

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
