import { z } from "zod";
import { buildTransactionCollectionResult } from "../transactionQueryEngine.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
import { toDisplayTransactions, transactionFields } from "../transactionQueryEngine.js";
export const name = "ynab_list_transactions";
export const description = "Lists transactions for a YNAB plan. Supports compact projections and pagination; prefer ynab_search_transactions for targeted drill-down.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    limit: z.number().int().min(1).max(500).optional().describe("Maximum number of transactions to return."),
    offset: z.number().int().min(0).optional().describe("Number of transactions to skip before returning results."),
    includeIds: z.boolean().optional().describe("When false, omits transaction ids from the output."),
    fields: z.array(z.enum(transactionFields)).optional().describe("Optional transaction fields to include in each row."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.transactions.getTransactions(planId, undefined, undefined, undefined));
        return toTextResult({
            ...buildTransactionCollectionResult(toDisplayTransactions(response.data.transactions), input, "transaction_count"),
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
