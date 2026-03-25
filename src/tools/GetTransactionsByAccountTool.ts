import { z } from "zod";
import * as ynab from "ynab";

import { toErrorResult } from "./planToolUtils.js";
import { executeTransactionLookup } from "./transactionToolUtils.js";

export const name = "ynab_get_transactions_by_account";
export const description = "Gets transactions for a single account when you already know the account ID.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  accountId: z.string().describe("The account ID to filter by."),
};

export async function execute(input: { planId?: string; accountId: string }, api: ynab.API) {
  try {
    return await executeTransactionLookup(
      input.planId,
      api,
      async (planId) => api.transactions.getTransactionsByAccount(
        planId,
        input.accountId,
        undefined,
        undefined,
        undefined,
      ),
    );
  } catch (error) {
    return toErrorResult(error);
  }
}
