import * as ynab from "ynab";

import { formatAmountMilliunits } from "./collectionToolUtils.js";
import { toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const transactionFields = [
  "date",
  "amount",
  "payee_name",
  "category_name",
  "account_name",
  "approved",
  "cleared",
] as const;

type TransactionLookupEntry = {
  id: string;
  date: string;
  amount: number;
  deleted?: boolean;
  payee_name?: string | null;
  category_name?: string | null;
  account_name?: string | null;
  approved?: boolean | null;
  cleared?: string | null;
};

type TransactionLookupResponse = {
  data: {
    transactions: TransactionLookupEntry[];
  };
};

export function toDisplayTransactions(transactions: TransactionLookupEntry[]) {
  return transactions
    .filter((transaction) => !transaction.deleted)
    .map((transaction) => ({
      id: transaction.id,
      date: transaction.date,
      amount: formatAmountMilliunits(transaction.amount),
      payee_name: transaction.payee_name,
      category_name: transaction.category_name,
      account_name: transaction.account_name,
      approved: transaction.approved,
      cleared: transaction.cleared,
    }));
}

export async function executeTransactionLookup(
  planId: string | undefined,
  api: ynab.API,
  fetchTransactions: (planId: string) => Promise<TransactionLookupResponse>,
) {
  const response = await withResolvedPlan(planId, api, fetchTransactions);
  const transactions = toDisplayTransactions(response.data.transactions);

  return toTextResult({
    transactions,
    transaction_count: transactions.length,
  });
}
