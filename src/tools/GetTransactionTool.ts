import { z } from "zod";
import * as ynab from "ynab";

import { toErrorResult, toTextResult, withResolvedPlan } from "../runtimePlanToolUtils.js";

export const name = "ynab_get_transaction";
export const description = "Gets a single transaction by ID.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  transactionId: z.string().describe("The transaction ID to fetch."),
};

export async function execute(input: { planId?: string; transactionId: string }, api: ynab.API) {
  try {
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.transactions.getTransactionById(planId, input.transactionId));
    return toTextResult({
      transaction: {
        id: response.data.transaction.id,
        date: response.data.transaction.date,
        amount: (response.data.transaction.amount / 1000).toFixed(2),
        payee_name: response.data.transaction.payee_name,
        category_name: response.data.transaction.category_name,
        account_name: response.data.transaction.account_name,
        approved: response.data.transaction.approved,
        cleared: response.data.transaction.cleared,
      },
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
