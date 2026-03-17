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

export const name = "ynab_get_transactions_by_category";
export const description = "Gets transactions for a single category.";
export const inputSchema = {
  planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
  categoryId: z.string().describe("The category ID to filter by."),
  limit: z.number().int().min(1).max(200).optional().describe("Max transactions to return."),
  includeFullDetails: z.boolean().optional().describe("Include extra transaction fields."),
};

export async function execute(
  input: { planId?: string; categoryId: string; limit?: number; includeFullDetails?: boolean },
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
