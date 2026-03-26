import {
  formatAmountMilliunits,
  hasPaginationControls,
  hasProjectionControls,
  paginateEntries,
  projectRecord,
} from "./collectionToolUtils.js";

export const transactionFields = [
  "date",
  "amount",
  "payee_name",
  "category_name",
  "account_name",
  "approved",
  "cleared",
] as const;

export const transactionSortValues = [
  "date_asc",
  "date_desc",
  "amount_asc",
  "amount_desc",
] as const;

type TransactionSummarySource = {
  id: string;
  date: string;
  amount: number;
  payee_name?: string | null;
  category_name?: string | null;
  account_name?: string | null;
  approved?: boolean | null;
  cleared?: string | null;
  deleted?: boolean | null;
};

type TransactionCollectionOptions = {
  fields?: Array<(typeof transactionFields)[number]>;
  includeIds?: boolean;
  limit?: number;
  offset?: number;
};

type TransactionSummaryRow = {
  id: string;
  date: string;
  amount: string;
  payee_name?: string | null;
  category_name?: string | null;
  account_name?: string | null;
  approved?: boolean | null;
  cleared?: string | null;
};

function compareTransactions(
  left: Pick<TransactionSummarySource, "amount" | "date" | "id">,
  right: Pick<TransactionSummarySource, "amount" | "date" | "id">,
  sort: (typeof transactionSortValues)[number],
) {
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

export function toSortedTransactionRows(
  transactions: TransactionSummarySource[],
  sort: (typeof transactionSortValues)[number] = "date_desc",
) {
  return toTransactionRows(transactions)
    .slice()
    .sort((left, right) => compareTransactions({
      amount: Number(left.amount),
      date: left.date,
      id: left.id,
    }, {
      amount: Number(right.amount),
      date: right.date,
      id: right.id,
    }, sort));
}

export function toTransactionRows(
  transactions: TransactionSummarySource[],
) {
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
    })) satisfies TransactionSummaryRow[];
}

export function buildTransactionCollectionResult(
  rows: TransactionSummaryRow[],
  options: TransactionCollectionOptions,
) {
  if (!hasPaginationControls(options) && !hasProjectionControls(options)) {
    return {
      transactions: rows,
      transaction_count: rows.length,
    };
  }

  if (!hasPaginationControls(options)) {
    return {
      transactions: rows.map((transaction) => projectRecord(transaction, transactionFields, options)),
      transaction_count: rows.length,
    };
  }

  const pagedTransactions = paginateEntries(rows, options);

  return {
    transactions: pagedTransactions.entries.map((transaction) => projectRecord(transaction, transactionFields, options)),
    transaction_count: rows.length,
    ...pagedTransactions.metadata,
  };
}

export function buildPagedTransactionCollectionResult(
  rows: TransactionSummaryRow[],
  options: TransactionCollectionOptions,
) {
  const pagedTransactions = paginateEntries(rows, options);

  return {
    transactions: pagedTransactions.entries.map((transaction) => projectRecord(transaction, transactionFields, options)),
    match_count: rows.length,
    ...pagedTransactions.metadata,
  };
}
