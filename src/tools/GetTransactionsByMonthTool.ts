import { z } from "zod";

import {
  buildTransactionCollectionInputSchema,
  monthTransactionCollectionExecutor,
} from "./transactionCollectionToolUtils.js";

export const name = "ynab_get_transactions_by_month";
export const description = "Gets transactions for a single plan month when you already know the exact month.";
export const inputSchema = buildTransactionCollectionInputSchema({
  month: z.string().describe("The month in ISO format (YYYY-MM-DD)."),
});

export const execute = monthTransactionCollectionExecutor;
