import { getConfiguredPlanId } from "./ynabApi.js";
import { withResolvedPlan as withExplicitResolvedPlan } from "./tools/planToolUtils.js";
export { toErrorResult, toProseResult, toTextResult } from "./tools/planToolUtils.js";
export async function withResolvedPlan(inputPlanId, api, operation) {
    const configuredPlanId = getConfiguredPlanId(api);
    return withExplicitResolvedPlan(inputPlanId, api, operation, {
        ...(configuredPlanId ? { configuredPlanId } : {}),
    });
}
