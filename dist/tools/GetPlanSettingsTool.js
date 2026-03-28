import { z } from "zod";
import { toErrorResult, toTextResult, withResolvedPlan } from "./runtimePlanToolUtils.js";
export const name = "ynab_get_plan_settings";
export const description = "Gets plan-level settings such as date and currency formatting.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.plans.getPlanSettingsById(planId));
        return toTextResult({
            settings: response.data.settings,
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
