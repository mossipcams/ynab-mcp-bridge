import { z } from "zod";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_money_movements";
export const description = "Gets all money movements for a single YNAB plan.";
export const inputSchema = {
    planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.moneyMovements.getMoneyMovements(planId));
        return toTextResult({
            money_movements: response.data.money_movements,
            count: response.data.money_movements.length,
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
