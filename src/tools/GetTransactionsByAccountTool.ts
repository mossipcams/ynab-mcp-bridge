import { z } from "zod";

import {
  buildTransactionCollectionInputSchema,
  createIdFilteredTransactionCollectionExecutor,
} from "./transactionCollectionToolUtils.js";

export const name = "ynab_get_transactions_by_account";
export const description = "Gets transactions for a single account when you already know the account ID.";
export const inputSchema = buildTransactionCollectionInputSchema({
  accountId: z.string().describe("The account ID to filter by."),
});

export const execute = createIdFilteredTransactionCollectionExecutor(
  async (transactions, planId, accountId) => (await transactions.getTransactionsByAccount(
    planId,
    accountId,
    undefined,
    undefined,
    undefined,
  )).data.transactions,
  "accountId",
);
