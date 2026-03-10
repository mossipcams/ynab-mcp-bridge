import { z } from "zod";
import { getPlanId, toErrorResult, toTextResult } from "./planToolUtils.js";
export const name = "ynab_get_transactions_by_payee";
export const description = "Gets transactions for a single payee.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    payeeId: z.string().describe("The payee ID to filter by."),
};
export async function execute(input, api) {
    try {
        const planId = getPlanId(input.planId);
        const response = await api.transactions.getTransactionsByPayee(planId, input.payeeId, undefined, undefined, undefined);
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
