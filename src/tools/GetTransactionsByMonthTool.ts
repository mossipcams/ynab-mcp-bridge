import { z } from "zod";
import * as ynab from "ynab";

import {
  buildCompactListPayload,
  normalizeListLimit,
  projectTransaction,
  toErrorResult,
  toTextResult,
  withResolvedPlan,
} from "./planToolUtils.js";

export const name = "ynab_get_transactions_by_month";
export const description = "Gets transactions for a single plan month.";
export const inputSchema = {
  planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
  month: z.string().describe("Month as YYYY-MM-DD."),
  limit: z.number().int().min(1).max(200).optional().describe("Max transactions to return."),
  includeFullDetails: z.boolean().optional().describe("Include extra transaction fields."),
};

export async function execute(
  input: { planId?: string; month: string; limit?: number; includeFullDetails?: boolean },
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

    const transactions = response.data.transactions
      .filter((transaction) => !transaction.deleted)
      .map((transaction) => projectTransaction(transaction, {
        includeFullDetails: input.includeFullDetails,
      }));

    return toTextResult(buildCompactListPayload("transactions", transactions, normalizeListLimit(input.limit)));
  } catch (error) {
    return toErrorResult(error);
  }
}
