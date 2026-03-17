import { z } from "zod";
import * as ynab from "ynab";

import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const name = "ynab_list_scheduled_transactions";
export const description = "Lists scheduled transactions for a single YNAB plan.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
};

export async function execute(input: { planId?: string }, api: ynab.API) {
  try {
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.scheduledTransactions.getScheduledTransactions(planId, undefined));
    const scheduledTransactions = response.data.scheduled_transactions
      .filter((transaction) => !transaction.deleted)
      .map((transaction) => ({
        id: transaction.id,
        date_first: transaction.date_first,
        date_next: transaction.date_next,
        amount: (transaction.amount / 1000).toFixed(2),
        payee_name: transaction.payee_name,
        category_name: transaction.category_name,
        account_name: transaction.account_name,
      }));

    return toTextResult({
      scheduled_transactions: scheduledTransactions,
      scheduled_transaction_count: scheduledTransactions.length,
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
