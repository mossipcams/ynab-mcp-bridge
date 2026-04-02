import { z } from "zod";
import { toErrorResult, toTextResult, withResolvedPlan } from "../../runtimePlanToolUtils.js";
export const name = "ynab_get_scheduled_transaction";
export const description = "Gets a single scheduled transaction by ID.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    scheduledTransactionId: z.string().describe("The scheduled transaction ID to fetch."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.scheduledTransactions.getScheduledTransactionById(planId, input.scheduledTransactionId));
        return toTextResult({
            scheduled_transaction: {
                id: response.data.scheduled_transaction.id,
                date_first: response.data.scheduled_transaction.date_first,
                date_next: response.data.scheduled_transaction.date_next,
                amount: (response.data.scheduled_transaction.amount / 1000).toFixed(2),
                payee_name: response.data.scheduled_transaction.payee_name,
                category_name: response.data.scheduled_transaction.category_name,
                account_name: response.data.scheduled_transaction.account_name,
            },
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
