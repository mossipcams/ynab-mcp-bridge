import { z } from "zod";
import * as ynab from "ynab";

import { toErrorResult } from "./planToolUtils.js";
import { executeTransactionLookup } from "./transactionToolUtils.js";

export const name = "ynab_get_transactions_by_payee";
export const description = "Gets transactions for a single payee when you already know the payee ID.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  payeeId: z.string().describe("The payee ID to filter by."),
};

export async function execute(input: { planId?: string; payeeId: string }, api: ynab.API) {
  try {
    return await executeTransactionLookup(
      input.planId,
      api,
      async (planId) => api.transactions.getTransactionsByPayee(
        planId,
        input.payeeId,
        undefined,
        undefined,
        undefined,
      ),
    );
  } catch (error) {
    return toErrorResult(error);
  }
}
