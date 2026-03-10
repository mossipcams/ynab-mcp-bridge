import { z } from "zod";
import { getPlanId, toErrorResult, toTextResult } from "./planToolUtils.js";
export const name = "ynab_get_plan";
export const description = "Gets a single YNAB plan with its detailed budgeting data.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
};
export async function execute(input, api) {
    try {
        const planId = getPlanId(input.planId);
        const response = await api.plans.getPlanById(planId, undefined);
        return toTextResult({
            plan: response.data.plan,
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
