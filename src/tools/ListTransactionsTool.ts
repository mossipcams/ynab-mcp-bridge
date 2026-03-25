import {
  buildTransactionCollectionInputSchema,
  listTransactionCollectionExecutor,
} from "./transactionCollectionToolUtils.js";

export const name = "ynab_list_transactions";
export const description =
  "Lists transactions for a YNAB plan. Supports compact projections and pagination; prefer ynab_search_transactions for targeted drill-down.";
export const inputSchema = buildTransactionCollectionInputSchema({});

export const execute = listTransactionCollectionExecutor;
