import { z } from "zod";
import { buildTransactionCollectionInputSchema, createIdFilteredTransactionCollectionExecutor, } from "./transactionCollectionToolUtils.js";
export const name = "ynab_get_transactions_by_payee";
export const description = "Gets transactions for a single payee when you already know the payee ID.";
export const inputSchema = buildTransactionCollectionInputSchema({
    payeeId: z.string().describe("The payee ID to filter by."),
});
export const execute = createIdFilteredTransactionCollectionExecutor(async (transactions, planId, payeeId) => (await transactions.getTransactionsByPayee(planId, payeeId, undefined, undefined, undefined)).data.transactions, "payeeId");
