import { z } from "zod";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_payee";
export const description = "Gets a single payee by ID.";
export const inputSchema = {
    planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
    payeeId: z.string().describe("The payee ID to fetch."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.payees.getPayeeById(planId, input.payeeId));
        return toTextResult({
            payee: response.data.payee,
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
