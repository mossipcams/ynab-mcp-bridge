import { z } from "zod";
import * as ynab from "ynab";

import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
import {
  buildTransactionCollectionResult,
  toSortedTransactionRows,
  transactionFields,
} from "./transactionQueryUtils.js";

export const name = "ynab_get_transactions_by_category";
export const description = "Gets transactions for a single category.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  categoryId: z.string().describe("The category ID to filter by."),
  limit: z.number().int().min(1).max(500).optional().describe("Maximum number of transactions to return."),
  offset: z.number().int().min(0).optional().describe("Number of transactions to skip before returning results."),
  includeIds: z.boolean().optional().describe("When false, omits transaction ids from the output."),
  fields: z.array(z.enum(transactionFields)).optional().describe("Optional transaction fields to include in each row."),
};

export async function execute(
  input: {
    planId?: string;
    categoryId: string;
    limit?: number;
    offset?: number;
    includeIds?: boolean;
    fields?: Array<(typeof transactionFields)[number]>;
  },
  api: ynab.API,
) {
  try {
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.transactions.getTransactionsByCategory(
      planId,
      input.categoryId,
      undefined,
      undefined,
      undefined,
    ));

    return toTextResult(buildTransactionCollectionResult(toSortedTransactionRows(response.data.transactions), input));
  } catch (error) {
    return toErrorResult(error);
  }
}
