import { z } from "zod";
import * as ynab from "ynab";

import { getPlanId, toErrorResult, toTextResult } from "./planToolUtils.js";

export const name = "ynab_get_transactions_by_category";
export const description = "Gets transactions for a single category.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  categoryId: z.string().describe("The category ID to filter by."),
};

export async function execute(input: { planId?: string; categoryId: string }, api: ynab.API) {
  try {
    const planId = getPlanId(input.planId);
    const response = await api.transactions.getTransactionsByCategory(
      planId,
      input.categoryId,
      undefined,
      undefined,
      undefined,
    );

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
