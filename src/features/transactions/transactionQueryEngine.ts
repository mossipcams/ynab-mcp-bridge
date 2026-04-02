import {
  formatAmountMilliunits,
  hasPaginationControls,
  hasProjectionControls,
  paginateEntries,
  projectRecord,
} from "../../tools/collectionToolUtils.js";

export const transactionFields = [
  "date",
  "amount",
  "payee_name",
  "category_name",
  "account_name",
  "approved",
  "cleared",
] as const;

type TransactionField = (typeof transactionFields)[number];

export type TransactionProjectionInput = {
  fields?: TransactionField[];
  includeIds?: boolean;
  limit?: number;
  offset?: number;
  planId?: string;
};

export type TransactionLike = {
  account_id?: string | null;
  account_name?: string | null;
  amount: number;
  approved?: boolean | null;
  category_id?: string | null;
  category_name?: string | null;
  cleared?: string | null;
  date: string;
  deleted?: boolean;
  id: string;
  payee_id?: string | null;
  payee_name?: string | null;
  transfer_account_id?: string | null;
};

type SearchTransactionInput = TransactionProjectionInput & {
  accountId?: string;
  approved?: boolean;
  categoryId?: string;
  cleared?: string;
  includeTransfers?: boolean;
  maxAmount?: number;
  minAmount?: number;
  payeeId?: string;
  sort?: TransactionSort;
  toDate?: string;
};

export type TransactionSort =
  | "amount_asc"
  | "amount_desc"
  | "date_asc"
  | "date_desc";

export type DisplayTransaction = {
  account_name?: string | null | undefined;
  amount: string;
  approved?: boolean | null | undefined;
  category_name?: string | null | undefined;
  cleared?: string | null | undefined;
  date: string;
  id: string;
  payee_name?: string | null | undefined;
};

export function assertTransactionMonth(month: string): string {
  if (month === "current" || /^\d{4}-\d{2}-01$/.test(month)) {
    return month;
  }

  throw new Error("Month must be 'current' or the first day of a month in YYYY-MM-DD format.");
}

export function toDisplayTransactions(transactions: readonly TransactionLike[]): DisplayTransaction[] {
  return transactions
    .filter((transaction) => !transaction.deleted)
    .map(toDisplayTransaction);
}

function toDisplayTransaction(transaction: TransactionLike): DisplayTransaction {
  return {
    id: transaction.id,
    date: transaction.date,
    amount: formatAmountMilliunits(transaction.amount),
    payee_name: transaction.payee_name,
    category_name: transaction.category_name,
    account_name: transaction.account_name,
    approved: transaction.approved,
    cleared: transaction.cleared,
  };
}

function toVisibleDisplayTransactions(transactions: readonly TransactionLike[]): DisplayTransaction[] {
  return transactions
    .map(toDisplayTransaction);
}

function applyTransactionProjection(
  transactions: readonly DisplayTransaction[],
  input: TransactionProjectionInput,
) {
  return transactions.map((transaction) => projectRecord(transaction, transactionFields, input));
}

export function buildTransactionCollectionResult(
  transactions: readonly TransactionLike[],
  input: TransactionProjectionInput,
  totalKey: "match_count" | "transaction_count",
  extra: Record<string, unknown> = {},
) {
  const visibleTransactions = transactions.filter((transaction) => !transaction.deleted);
  const totalCount = visibleTransactions.length;

  if (!hasPaginationControls(input) && !hasProjectionControls(input)) {
    return {
      transactions: toVisibleDisplayTransactions(visibleTransactions),
      [totalKey]: totalCount,
      ...extra,
    };
  }

  if (!hasPaginationControls(input)) {
    const displayTransactions = toVisibleDisplayTransactions(visibleTransactions);

    return {
      transactions: applyTransactionProjection(displayTransactions, input),
      [totalKey]: totalCount,
      ...extra,
    };
  }

  const pagedTransactions = paginateEntries(visibleTransactions, input);
  const displayTransactions = toVisibleDisplayTransactions(pagedTransactions.entries);

  return {
    transactions: hasProjectionControls(input)
      ? applyTransactionProjection(displayTransactions, input)
      : displayTransactions,
    [totalKey]: totalCount,
    ...pagedTransactions.metadata,
    ...extra,
  };
}

export function compareTransactions(
  left: Pick<TransactionLike, "amount" | "date" | "id">,
  right: Pick<TransactionLike, "amount" | "date" | "id">,
  sort: TransactionSort,
) {
  switch (sort) {
    case "date_asc":
      return left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
    case "date_desc":
      return right.date.localeCompare(left.date) || left.id.localeCompare(right.id);
    case "amount_asc":
      return left.amount - right.amount
        || right.date.localeCompare(left.date)
        || left.id.localeCompare(right.id);
    case "amount_desc":
      return right.amount - left.amount
        || right.date.localeCompare(left.date)
        || left.id.localeCompare(right.id);
  }
}

export function matchesTransactionFilters(
  transaction: TransactionLike,
  input: SearchTransactionInput,
): boolean {
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
