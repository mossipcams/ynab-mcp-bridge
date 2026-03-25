import { z } from "zod";
import * as ynab from "ynab";

import {
  buildTransactionCollectionResult,
  toDisplayTransactions,
  transactionFields,
} from "../transactionQueryEngine.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const name = "ynab_get_transactions_by_account";
export const description = "Gets transactions for a single account with optional compact projections and pagination.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  accountId: z.string().describe("The account ID to filter by."),
  limit: z.number().int().min(1).max(500).optional().describe("Maximum number of transactions to return."),
  offset: z.number().int().min(0).optional().describe("Number of transactions to skip before returning results."),
  includeIds: z.boolean().optional().describe("When false, omits transaction ids from the output."),
  fields: z.array(z.enum(transactionFields)).optional().describe("Optional transaction fields to include in each row."),
};

export async function execute(
  input: {
    accountId: string;
    fields?: Array<(typeof transactionFields)[number]>;
    includeIds?: boolean;
    limit?: number;
    offset?: number;
    planId?: string;
  },
  api: ynab.API,
) {
  try {
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.transactions.getTransactionsByAccount(
      planId,
      input.accountId,
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
