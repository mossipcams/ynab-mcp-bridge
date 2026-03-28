import { z } from "zod";
import { toErrorResult, toTextResult, withResolvedPlan } from "../runtimePlanToolUtils.js";
export const name = "ynab_get_money_movements_by_month";
export const description = "Gets money movements for a single plan month.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    month: z.string().describe("The month in ISO format (YYYY-MM-DD)."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.moneyMovements.getMoneyMovementsByMonth(planId, input.month));
        return toTextResult({
            money_movements: response.data.money_movements,
            count: response.data.money_movements.length,
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
