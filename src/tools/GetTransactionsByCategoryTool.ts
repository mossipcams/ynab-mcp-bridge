import { z } from "zod";
import * as ynab from "ynab";

import { toErrorResult } from "./planToolUtils.js";
import { executeTransactionLookup } from "./transactionToolUtils.js";

export const name = "ynab_get_transactions_by_category";
export const description = "Gets transactions for a single category when you already know the category ID.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  categoryId: z.string().describe("The category ID to filter by."),
};

export async function execute(input: { planId?: string; categoryId: string }, api: ynab.API) {
  try {
    return await executeTransactionLookup(
      input.planId,
      api,
      async (planId) => api.transactions.getTransactionsByCategory(
        planId,
        input.categoryId,
        undefined,
        undefined,
        undefined,
      ),
    );
  } catch (error) {
    return toErrorResult(error);
  }
}
