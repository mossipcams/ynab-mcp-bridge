import { z } from "zod";
import * as ynab from "ynab";

import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
import {
  buildTransactionCollectionResult,
  toTransactionRows,
  transactionFields,
} from "./transactionQueryUtils.js";

export const name = "ynab_get_transactions_by_month";
export const description = "Gets transactions for a single plan month.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  month: z.string().describe("The month in ISO format (YYYY-MM-DD)."),
  limit: z.number().int().min(1).max(500).optional().describe("Maximum number of transactions to return."),
  offset: z.number().int().min(0).optional().describe("Number of transactions to skip before returning results."),
  includeIds: z.boolean().optional().describe("When false, omits transaction ids from the output."),
  fields: z.array(z.enum(transactionFields)).optional().describe("Optional transaction fields to include in each row."),
};

export async function execute(
  input: {
    planId?: string;
    month: string;
    limit?: number;
    offset?: number;
    includeIds?: boolean;
    fields?: Array<(typeof transactionFields)[number]>;
  },
  api: ynab.API,
) {
  try {
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.transactions.getTransactionsByMonth(
      planId,
      input.month,
      undefined,
      undefined,
      undefined,
    ));

    return toTextResult(buildTransactionCollectionResult(toTransactionRows(response.data.transactions), input));
  } catch (error) {
    return toErrorResult(error);
  }
}
