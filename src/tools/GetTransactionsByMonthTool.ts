import { z } from "zod";
import * as ynab from "ynab";

import { toErrorResult } from "./planToolUtils.js";
import { executeTransactionLookup } from "./transactionToolUtils.js";

export const name = "ynab_get_transactions_by_month";
export const description = "Gets transactions for a single plan month when you already know the exact month.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  month: z.string().describe("The month in ISO format (YYYY-MM-DD)."),
};

export async function execute(input: { planId?: string; month: string }, api: ynab.API) {
  try {
    return await executeTransactionLookup(
      input.planId,
      api,
      async (planId) => api.transactions.getTransactionsByMonth(
        planId,
        input.month,
        undefined,
        undefined,
        undefined,
      ),
    );
  } catch (error) {
    return toErrorResult(error);
  }
}
