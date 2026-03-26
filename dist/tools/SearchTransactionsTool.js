import { z } from "zod";
import { formatAmountMilliunits } from "./collectionToolUtils.js";
import { compactObject } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
import { buildPagedTransactionCollectionResult, toSortedTransactionRows, transactionFields, transactionSortValues, } from "./transactionQueryUtils.js";
export const name = "ynab_search_transactions";
export const description = "Searches transactions with compact filters, projections, and pagination for AI-friendly drill-down.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Optional inclusive start date."),
    toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Optional inclusive end date."),
    payeeId: z.string().optional().describe("Optional payee id filter."),
    accountId: z.string().optional().describe("Optional account id filter."),
    categoryId: z.string().optional().describe("Optional category id filter."),
    approved: z.boolean().optional().describe("Optional approval-state filter."),
    cleared: z.string().optional().describe("Optional cleared-state filter."),
    minAmount: z.number().optional().describe("Optional minimum amount in YNAB milliunits."),
    maxAmount: z.number().optional().describe("Optional maximum amount in YNAB milliunits."),
    includeTransfers: z.boolean().default(false).describe("When false, omits transfer transactions."),
    limit: z.number().int().min(1).max(500).default(50).describe("Maximum number of transactions to return."),
    offset: z.number().int().min(0).default(0).describe("Number of matching transactions to skip."),
    includeIds: z.boolean().optional().describe("When false, omits transaction ids from the output."),
    fields: z.array(z.enum(transactionFields)).optional().describe("Optional transaction fields to include in each row."),
    sort: z.enum(transactionSortValues).default("date_desc").describe("Sort order for matching transactions."),
};
function matchesFilters(transaction, input) {
    if (input.includeTransfers === false && transaction.transfer_account_id) {
        return false;
    }
    if (input.toDate && transaction.date > input.toDate) {
        return false;
    }
    if (input.payeeId && transaction.payee_id !== input.payeeId) {
        return false;
    }
    if (input.accountId && transaction.account_id !== input.accountId) {
        return false;
    }
    if (input.categoryId && transaction.category_id !== input.categoryId) {
        return false;
    }
    if (input.approved !== undefined && transaction.approved !== input.approved) {
        return false;
    }
    if (input.cleared && transaction.cleared !== input.cleared) {
        return false;
    }
    if (input.minAmount !== undefined && transaction.amount < input.minAmount) {
        return false;
    }
    if (input.maxAmount !== undefined && transaction.amount > input.maxAmount) {
        return false;
    }
    return true;
}
export async function execute(input, api) {
    try {
        const fromDate = input.fromDate;
        const sort = input.sort ?? "date_desc";
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.transactions.getTransactions(planId, fromDate, undefined, undefined));
        const transactions = toSortedTransactionRows(response.data.transactions
            .filter((transaction) => !transaction.deleted)
            .filter((transaction) => matchesFilters(transaction, input)), sort);
        return toTextResult({
            ...buildPagedTransactionCollectionResult(transactions, input),
            filters: compactObject({
                from_date: input.fromDate,
                to_date: input.toDate,
                payee_id: input.payeeId,
                account_id: input.accountId,
                category_id: input.categoryId,
                approved: input.approved,
                cleared: input.cleared,
                min_amount: input.minAmount == null ? undefined : formatAmountMilliunits(input.minAmount),
                max_amount: input.maxAmount == null ? undefined : formatAmountMilliunits(input.maxAmount),
                include_transfers: input.includeTransfers ?? false,
                sort,
            }),
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
