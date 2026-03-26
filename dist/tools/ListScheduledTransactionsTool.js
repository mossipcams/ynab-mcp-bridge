import { z } from "zod";
import { formatAmountMilliunits, hasPaginationControls, hasProjectionControls, paginateEntries, projectRecord, } from "./collectionToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_list_scheduled_transactions";
export const description = "Lists scheduled transactions for a YNAB plan with optional compact projections and pagination.";
const scheduledTransactionFields = [
    "date_first",
    "date_next",
    "amount",
    "payee_name",
    "category_name",
    "account_name",
];
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    limit: z.number().int().min(1).max(500).optional().describe("Maximum number of scheduled transactions to return."),
    offset: z.number().int().min(0).optional().describe("Number of scheduled transactions to skip before returning results."),
    includeIds: z.boolean().optional().describe("When false, omits scheduled transaction ids from the output."),
    fields: z.array(z.enum(scheduledTransactionFields)).optional().describe("Optional scheduled transaction fields to include in each row."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.scheduledTransactions.getScheduledTransactions(planId, undefined));
        const scheduledTransactions = response.data.scheduled_transactions
            .filter((transaction) => !transaction.deleted)
            .map((transaction) => ({
            id: transaction.id,
            date_first: transaction.date_first,
            date_next: transaction.date_next,
            amount: formatAmountMilliunits(transaction.amount),
            payee_name: transaction.payee_name,
            category_name: transaction.category_name,
            account_name: transaction.account_name,
        }));
        if (!hasPaginationControls(input) && !hasProjectionControls(input)) {
            return toTextResult({
                scheduled_transactions: scheduledTransactions,
                scheduled_transaction_count: scheduledTransactions.length,
            });
        }
        if (!hasPaginationControls(input)) {
            return toTextResult({
                scheduled_transactions: scheduledTransactions.map((transaction) => projectRecord(transaction, scheduledTransactionFields, input)),
                scheduled_transaction_count: scheduledTransactions.length,
            });
        }
        const pagedTransactions = paginateEntries(scheduledTransactions, input);
        return toTextResult({
            scheduled_transactions: pagedTransactions.entries.map((transaction) => projectRecord(transaction, scheduledTransactionFields, input)),
            scheduled_transaction_count: scheduledTransactions.length,
            ...pagedTransactions.metadata,
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
