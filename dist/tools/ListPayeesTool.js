import { z } from "zod";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_list_payees";
export const description = "Lists payees for a single YNAB plan.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.payees.getPayees(planId));
        const payees = response.data.payees
            .filter((payee) => !payee.deleted)
            .map((payee) => ({
            id: payee.id,
            name: payee.name,
            transfer_account_id: payee.transfer_account_id,
        }));
        return toTextResult({
            payees,
            payee_count: payees.length,
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
