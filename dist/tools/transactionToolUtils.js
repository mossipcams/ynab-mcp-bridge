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
];
export function toDisplayTransactions(transactions) {
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
export async function executeTransactionLookup(planId, api, fetchTransactions) {
    const response = await withResolvedPlan(planId, api, fetchTransactions);
    const transactions = toDisplayTransactions(response.data.transactions);
    return toTextResult({
        transactions,
        transaction_count: transactions.length,
    });
}
