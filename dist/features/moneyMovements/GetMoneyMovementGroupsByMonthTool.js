import { z } from "zod";
import { toErrorResult, toTextResult, withResolvedPlan } from "../../runtimePlanToolUtils.js";
export const name = "ynab_get_money_movement_groups_by_month";
export const description = "Gets money movement groups for a single plan month.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    month: z.string().describe("The month in ISO format (YYYY-MM-DD)."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.moneyMovements.getMoneyMovementGroupsByMonth(planId, input.month));
        return toTextResult({
            money_movement_groups: response.data.money_movement_groups,
            count: response.data.money_movement_groups.length,
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
