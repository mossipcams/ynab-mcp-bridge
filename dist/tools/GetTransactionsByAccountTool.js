import { z } from "zod";
import { buildCompactListPayload, normalizeListLimit, projectTransaction, toErrorResult, toTextResult, withResolvedPlan, } from "./planToolUtils.js";
export const name = "ynab_get_transactions_by_account";
export const description = "Gets transactions for a single account.";
export const inputSchema = {
    planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
    accountId: z.string().describe("The account ID to filter by."),
    limit: z.number().int().min(1).max(200).optional().describe("Max transactions to return."),
    includeFullDetails: z.boolean().optional().describe("Include extra transaction fields."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.transactions.getTransactionsByAccount(planId, input.accountId, undefined, undefined, undefined));
        const transactions = response.data.transactions
            .filter((transaction) => !transaction.deleted)
            .map((transaction) => projectTransaction(transaction, {
            includeFullDetails: input.includeFullDetails,
        }));
        return toTextResult(buildCompactListPayload("transactions", transactions, normalizeListLimit(input.limit)));
    }
    catch (error) {
        return toErrorResult(error);
    }
}
