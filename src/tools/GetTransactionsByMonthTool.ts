import { z } from "zod";
import {
  buildTransactionCollectionInputSchema,
  monthTransactionCollectionExecutor,
} from "./transactionCollectionToolUtils.js";

export const name = "ynab_get_transactions_by_month";
export const description = "Gets transactions for a single plan month with optional compact projections and pagination.";
export const inputSchema = buildTransactionCollectionInputSchema({
  month: z.string().describe("The month in ISO format (YYYY-MM-DD) or the string 'current'."),
});

export const execute = monthTransactionCollectionExecutor;
