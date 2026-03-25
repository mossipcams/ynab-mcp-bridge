import { z } from "zod";
import * as ynab from "ynab";

import { renderCollectionResult } from "./collectionToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
import { toDisplayTransactions, transactionFields } from "./transactionToolUtils.js";

export const name = "ynab_list_transactions";
export const description =
  "Lists transactions for a YNAB plan as a general overview. Supports compact projections and pagination; prefer ynab_search_transactions for targeted drill-down.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  limit: z.number().int().min(1).max(500).optional().describe("Maximum number of transactions to return."),
  offset: z.number().int().min(0).optional().describe("Number of transactions to skip before returning results."),
  includeIds: z.boolean().optional().describe("When false, omits transaction ids from the output."),
  fields: z.array(z.enum(transactionFields)).optional().describe("Optional transaction fields to include in each row."),
};

export async function execute(
  input: {
    planId?: string;
    limit?: number;
    offset?: number;
    includeIds?: boolean;
    fields?: Array<(typeof transactionFields)[number]>;
  },
  api: ynab.API,
) {
  try {
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.transactions.getTransactions(
      planId,
      undefined,
      undefined,
      undefined,
    ));
    const transactions = toDisplayTransactions(response.data.transactions);

    return toTextResult(renderCollectionResult(
      transactions,
      transactionFields,
      input,
      "transactions",
      "transaction_count",
    ));
  } catch (error) {
    return toErrorResult(error);
  }
}
