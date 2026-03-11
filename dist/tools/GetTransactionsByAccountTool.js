import { z } from "zod";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_transactions_by_account";
export const description = "Gets transactions for a single account.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    accountId: z.string().describe("The account ID to filter by."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.transactions.getTransactionsByAccount(planId, input.accountId, undefined, undefined, undefined));
        return toTextResult({
            transactions: response.data.transactions
                .filter((transaction) => !transaction.deleted)
                .map((transaction) => ({
                id: transaction.id,
                date: transaction.date,
                amount: (transaction.amount / 1000).toFixed(2),
                payee_name: transaction.payee_name,
                category_name: transaction.category_name,
                account_name: transaction.account_name,
                approved: transaction.approved,
                cleared: transaction.cleared,
            })),
            transaction_count: response.data.transactions.filter((transaction) => !transaction.deleted).length,
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
