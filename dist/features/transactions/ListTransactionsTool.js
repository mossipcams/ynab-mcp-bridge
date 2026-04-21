import { buildTransactionCollectionInputSchema, listTransactionCollectionExecutor, } from "./transactionCollectionToolUtils.js";
export const name = "ynab_list_transactions";
export const description = "Lists transactions for bounded row inspection after summaries or search narrow the scope. Defaults to a compact projected page; prefer ynab_search_transactions or financial summary tools first.";
export const inputSchema = buildTransactionCollectionInputSchema({});
export const execute = listTransactionCollectionExecutor;
