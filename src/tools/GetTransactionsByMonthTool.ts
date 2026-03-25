import { z } from "zod";
import * as ynab from "ynab";

import {
  assertTransactionMonth,
  buildTransactionCollectionResult,
  toDisplayTransactions,
  transactionFields,
} from "../transactionQueryEngine.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const name = "ynab_get_transactions_by_month";
export const description = "Gets transactions for a single plan month with optional compact projections and pagination.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  month: z.string().describe("The month in ISO format (YYYY-MM-DD) or the string 'current'."),
  limit: z.number().int().min(1).max(500).optional().describe("Maximum number of transactions to return."),
  offset: z.number().int().min(0).optional().describe("Number of transactions to skip before returning results."),
  includeIds: z.boolean().optional().describe("When false, omits transaction ids from the output."),
  fields: z.array(z.enum(transactionFields)).optional().describe("Optional transaction fields to include in each row."),
};

export async function execute(
  input: {
    fields?: Array<(typeof transactionFields)[number]>;
    includeIds?: boolean;
    limit?: number;
    month: string;
    offset?: number;
    planId?: string;
  },
  api: ynab.API,
) {
  try {
    const month = assertTransactionMonth(input.month);
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.transactions.getTransactionsByMonth(
      planId,
      month,
      undefined,
      undefined,
      undefined,
    ));

    return toTextResult({
      ...buildTransactionCollectionResult(
        toDisplayTransactions(response.data.transactions),
        input,
        "transaction_count",
      ),
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
