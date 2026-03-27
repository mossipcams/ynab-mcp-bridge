import { formatAmountMilliunits, hasPaginationControls, hasProjectionControls, paginateEntries, projectRecord, } from "./tools/collectionToolUtils.js";
export const transactionFields = [
    "date",
    "amount",
    "payee_name",
    "category_name",
    "account_name",
    "approved",
    "cleared",
];
export function assertTransactionMonth(month) {
    if (month === "current" || /^\d{4}-\d{2}-01$/.test(month)) {
        return month;
    }
    throw new Error("Month must be 'current' or the first day of a month in YYYY-MM-DD format.");
}
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
function applyTransactionProjection(transactions, input) {
    return transactions.map((transaction) => projectRecord(transaction, transactionFields, input));
}
export function buildTransactionCollectionResult(transactions, input, totalKey, extra = {}) {
    const totalCount = transactions.length;
    if (!hasPaginationControls(input) && !hasProjectionControls(input)) {
        return {
            transactions: toDisplayTransactions(transactions),
            [totalKey]: totalCount,
            ...extra,
        };
    }
    if (!hasPaginationControls(input)) {
        const displayTransactions = toDisplayTransactions(transactions);
        return {
            transactions: applyTransactionProjection(displayTransactions, input),
            [totalKey]: totalCount,
            ...extra,
        };
    }
    const pagedTransactions = paginateEntries([...transactions], input);
    const displayTransactions = toDisplayTransactions(pagedTransactions.entries);
    return {
        transactions: hasProjectionControls(input)
            ? applyTransactionProjection(displayTransactions, input)
            : displayTransactions,
        [totalKey]: totalCount,
        ...pagedTransactions.metadata,
        ...extra,
    };
}
export function compareTransactions(left, right, sort) {
    switch (sort) {
        case "date_asc":
            return left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
        case "date_desc":
            return right.date.localeCompare(left.date) || left.id.localeCompare(right.id);
        case "amount_asc":
            return left.amount - right.amount || right.date.localeCompare(left.date);
        case "amount_desc":
            return right.amount - left.amount || right.date.localeCompare(left.date);
    }
}
export function matchesTransactionFilters(transaction, input) {
    return [
        input.includeTransfers !== false || !transaction.transfer_account_id,
        !input.toDate || transaction.date <= input.toDate,
        !input.payeeId || transaction.payee_id === input.payeeId,
        !input.accountId || transaction.account_id === input.accountId,
        !input.categoryId || transaction.category_id === input.categoryId,
        input.approved === undefined || transaction.approved === input.approved,
        !input.cleared || transaction.cleared === input.cleared,
        input.minAmount === undefined || transaction.amount >= input.minAmount,
        input.maxAmount === undefined || transaction.amount <= input.maxAmount,
    ].every(Boolean);
}
