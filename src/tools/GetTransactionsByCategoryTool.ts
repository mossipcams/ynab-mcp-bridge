import { z } from "zod";

import {
  buildTransactionCollectionInputSchema,
  createIdFilteredTransactionCollectionExecutor,
} from "./transactionCollectionToolUtils.js";

export const name = "ynab_get_transactions_by_category";
export const description = "Gets transactions for a single category with optional compact projections and pagination.";
export const inputSchema = buildTransactionCollectionInputSchema({
  categoryId: z.string().describe("The category ID to filter by."),
});

export const execute = createIdFilteredTransactionCollectionExecutor(
  async (transactions, planId, categoryId) => (await transactions.getTransactionsByCategory(
      planId,
      categoryId,
      undefined,
      undefined,
      undefined,
    )).data.transactions,
  "categoryId",
);
