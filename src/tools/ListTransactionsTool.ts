import { z } from "zod";
import * as ynab from "ynab";

import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const name = "ynab_list_transactions";
export const description = "Gets all transactions for a single YNAB plan.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
};

export async function execute(input: { planId?: string }, api: ynab.API) {
  try {
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.transactions.getTransactions(
      planId,
      undefined,
      undefined,
      undefined,
    ));

    return toTextResult({
      transactions: response.data.transactions
        .filter((transaction) => !transaction.deleted)
        .map((transaction) => ({
          id: transaction.id,
          date: transaction.date,
          amount: (transaction.amount / 1000).toFixed(2),
          payee_name: transaction.payee_name,
          category_name: transaction.category_name,
          account_name: transaction.account_name,
          approved: transaction.approved,
          cleared: transaction.cleared,
        })),
      transaction_count: response.data.transactions.filter((transaction) => !transaction.deleted).length,
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
