import { z } from "zod";
import { assertTransactionMonth, buildTransactionCollectionResult, compareTransactions, transactionFields, } from "../transactionQueryEngine.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
async function runTransactionCollectionTool(input, api, fetchTransactions, options = {}) {
    try {
        const normalizedInput = options.normalizeInput ? options.normalizeInput(input) : input;
        const transactions = await withResolvedPlan(normalizedInput.planId, api, async (planId) => fetchTransactions(api, planId, normalizedInput));
        const sortedTransactions = transactions
            .filter((transaction) => !transaction.deleted)
            .sort((left, right) => compareTransactions(left, right, "date_desc"));
        return toTextResult({
            ...buildTransactionCollectionResult(sortedTransactions, normalizedInput, "transaction_count"),
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
export function createTransactionCollectionExecutor(fetchTransactions, options = {}) {
    return async (input, api) => runTransactionCollectionTool(input, api, fetchTransactions, options);
}
export const transactionCollectionInputSchema = {
    planId: z.string().optional().describe("Plan ID (uses env default)"),
    limit: z.number().int().min(1).max(500).optional().describe("Max results"),
    offset: z.number().int().min(0).optional().describe("Skip N results"),
    includeIds: z.boolean().optional().describe("Include IDs"),
    fields: z.array(z.enum(transactionFields)).optional().describe("Fields to include"),
};
export function buildTransactionCollectionInputSchema(extra) {
    return {
        ...transactionCollectionInputSchema,
        ...extra,
    };
}
export const listTransactionCollectionExecutor = createTransactionCollectionExecutor(async (api, planId) => (await api.transactions.getTransactions(planId, undefined, undefined, undefined)).data.transactions);
export const monthTransactionCollectionExecutor = createTransactionCollectionExecutor(async (api, planId, normalizedInput) => (await api.transactions.getTransactionsByMonth(planId, normalizedInput.month, undefined, undefined, undefined)).data.transactions, {
    normalizeInput: (value) => ({
        ...value,
        month: assertTransactionMonth(value.month),
    }),
});
export function createIdFilteredTransactionCollectionExecutor(fetchTransactions, selectorKey) {
    return createTransactionCollectionExecutor(async (api, planId, input) => fetchTransactions(api.transactions, planId, input[selectorKey]));
}
