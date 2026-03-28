import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  assertTransactionMonth,
  buildTransactionCollectionResult,
  compareTransactions,
  matchesTransactionFilters,
  toDisplayTransactions,
  type DisplayTransaction,
  type TransactionLike,
  type TransactionProjectionInput,
} from "./transactionQueryEngine.js";

type QueryState = TransactionProjectionInput;

type QueryCommand =
  | { type: "setLimit"; value: number | undefined }
  | { type: "setOffset"; value: number | undefined }
  | { type: "setFields"; value: Array<"date" | "amount" | "payee_name" | "category_name" | "account_name" | "approved" | "cleared"> | undefined }
  | { type: "setIncludeIds"; value: boolean | undefined }
  | { type: "clearPagination" }
  | { type: "clearProjection" };

const baseTransactions: TransactionLike[] = [
  {
    id: "txn-1",
    date: "2026-03-05",
    amount: -2500,
    payee_name: "Grocer",
    category_name: "Groceries",
    account_name: "Checking",
    approved: true,
    cleared: "cleared",
  },
  {
    id: "txn-2",
    date: "2026-03-04",
    amount: -1200,
    payee_name: "Cafe",
    category_name: "Dining",
    account_name: "Checking",
    approved: false,
    cleared: "uncleared",
    deleted: true,
  },
  {
    id: "txn-3",
    date: "2026-03-03",
    amount: -4200,
    payee_name: "Fuel Stop",
    category_name: "Fuel",
    account_name: "Credit Card",
    approved: true,
    cleared: "cleared",
  },
];

function formatAmount(value: number) {
  return (value / 1000).toFixed(2);
}

function toReferenceDisplayTransactions(
  transactions: readonly TransactionLike[],
): DisplayTransaction[] {
  return transactions
    .filter((transaction) => !transaction.deleted)
    .map((transaction) => ({
      id: transaction.id,
      date: transaction.date,
      amount: formatAmount(transaction.amount),
      payee_name: transaction.payee_name,
      category_name: transaction.category_name,
      account_name: transaction.account_name,
      approved: transaction.approved,
      cleared: transaction.cleared,
    }));
}

function projectDisplayTransactions(
  transactions: readonly DisplayTransaction[],
  input: TransactionProjectionInput,
) {
  const requestedFields = input.fields?.length
    ? input.fields
    : ["date", "amount", "payee_name", "category_name", "account_name", "approved", "cleared"] as const;

  return transactions.map((transaction) => {
    const projected = Object.fromEntries(
      requestedFields
        .filter((field) => field in transaction)
        .map((field) => [field, transaction[field]]),
    ) as Record<string, unknown>;

    if (input.includeIds !== false) {
      projected.id = transaction.id;
    }

    return Object.fromEntries(
      Object.entries(projected).filter(([, value]) => value !== undefined && value !== null),
    );
  });
}

function normalizePaginationNumber(value: number | undefined, fallback: number, minimum: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(Math.trunc(value), minimum);
}

function buildReferenceTransactionCollectionResult(
  transactions: readonly TransactionLike[],
  input: TransactionProjectionInput,
  totalKey: "match_count" | "transaction_count",
) {
  const visibleTransactions = transactions.filter((transaction) => !transaction.deleted);
  const totalCount = visibleTransactions.length;
  const hasPagination = input.limit !== undefined || input.offset !== undefined;
  const hasProjection = input.includeIds !== undefined || input.fields !== undefined;

  if (!hasPagination && !hasProjection) {
    return {
      transactions: toReferenceDisplayTransactions(visibleTransactions),
      [totalKey]: totalCount,
    };
  }

  if (!hasPagination) {
    return {
      transactions: projectDisplayTransactions(toReferenceDisplayTransactions(visibleTransactions), input),
      [totalKey]: totalCount,
    };
  }

  const offset = normalizePaginationNumber(input.offset, 0, 0);
  const limit = normalizePaginationNumber(input.limit, 50, 1);
  const pagedTransactions = visibleTransactions.slice(offset, offset + limit);
  const nextOffset = offset + pagedTransactions.length;
  const hasMore = nextOffset < visibleTransactions.length;
  const displayTransactions = toReferenceDisplayTransactions(pagedTransactions);

  return {
    transactions: hasProjection ? projectDisplayTransactions(displayTransactions, input) : displayTransactions,
    [totalKey]: totalCount,
    returned_count: pagedTransactions.length,
    offset,
    limit,
    has_more: hasMore,
    ...(hasMore ? { next_offset: nextOffset } : {}),
  };
}

function applyCommand(state: QueryState, command: QueryCommand): QueryState {
  switch (command.type) {
    case "setLimit":
      return { ...state, limit: command.value };
    case "setOffset":
      return { ...state, offset: command.value };
    case "setFields":
      return { ...state, fields: command.value };
    case "setIncludeIds":
      return { ...state, includeIds: command.value };
    case "clearPagination":
      return { ...state, limit: undefined, offset: undefined };
    case "clearProjection":
      return { ...state, fields: undefined, includeIds: undefined };
  }
}

const queryCommandArbitrary = fc.oneof(
  fc.record({
    type: fc.constant("setLimit" as const),
    value: fc.option(fc.integer({ min: -5, max: 10 }), { nil: undefined }),
  }),
  fc.record({
    type: fc.constant("setOffset" as const),
    value: fc.option(fc.integer({ min: -5, max: 10 }), { nil: undefined }),
  }),
  fc.record({
    type: fc.constant("setFields" as const),
    value: fc.option(
      fc.uniqueArray(
        fc.constantFrom(
          "date",
          "amount",
          "payee_name",
          "category_name",
          "account_name",
          "approved",
          "cleared",
        ),
        { maxLength: 7 },
      ),
      { nil: undefined },
    ),
  }),
  fc.record({
    type: fc.constant("setIncludeIds" as const),
    value: fc.option(fc.boolean(), { nil: undefined }),
  }),
  fc.constant({ type: "clearPagination" as const }),
  fc.constant({ type: "clearProjection" as const }),
);

describe("transaction query engine", () => {
  it("accepts current or first-of-month inputs and rejects invalid month values", () => {
    expect(assertTransactionMonth("current")).toBe("current");
    expect(assertTransactionMonth("2026-03-01")).toBe("2026-03-01");
    expect(() => assertTransactionMonth("2026-03-02")).toThrow(
      "Month must be 'current' or the first day of a month in YYYY-MM-DD format.",
    );
  });

  it("omits deleted rows when formatting display transactions directly", () => {
    expect(toDisplayTransactions(baseTransactions)).toEqual([
      {
        id: "txn-1",
        date: "2026-03-05",
        amount: "-2.50",
        payee_name: "Grocer",
        category_name: "Groceries",
        account_name: "Checking",
        approved: true,
        cleared: "cleared",
      },
      {
        id: "txn-3",
        date: "2026-03-03",
        amount: "-4.20",
        payee_name: "Fuel Stop",
        category_name: "Fuel",
        account_name: "Credit Card",
        approved: true,
        cleared: "cleared",
      },
    ]);
  });

  it("returns visible transaction rows and counts when no controls are provided", () => {
    expect(buildTransactionCollectionResult(baseTransactions, {}, "transaction_count")).toEqual({
      transactions: [
        {
          id: "txn-1",
          date: "2026-03-05",
          amount: "-2.50",
          payee_name: "Grocer",
          category_name: "Groceries",
          account_name: "Checking",
          approved: true,
          cleared: "cleared",
        },
        {
          id: "txn-3",
          date: "2026-03-03",
          amount: "-4.20",
          payee_name: "Fuel Stop",
          category_name: "Fuel",
          account_name: "Credit Card",
          approved: true,
          cleared: "cleared",
        },
      ],
      transaction_count: 2,
    });
  });

  it("counts and paginates only visible transactions when deleted entries are present", () => {
    expect(buildTransactionCollectionResult(baseTransactions, {
      limit: 2,
      offset: 0,
    }, "transaction_count")).toEqual({
      transactions: [
        {
          id: "txn-1",
          date: "2026-03-05",
          amount: "-2.50",
          payee_name: "Grocer",
          category_name: "Groceries",
          account_name: "Checking",
          approved: true,
          cleared: "cleared",
        },
        {
          id: "txn-3",
          date: "2026-03-03",
          amount: "-4.20",
          payee_name: "Fuel Stop",
          category_name: "Fuel",
          account_name: "Credit Card",
          approved: true,
          cleared: "cleared",
        },
      ],
      transaction_count: 2,
      returned_count: 2,
      offset: 0,
      limit: 2,
      has_more: false,
    });
  });

  it("does not re-check deleted flags after building the visible transaction list", () => {
    let visibleDeletedChecks = 0;
    let deletedDeletedChecks = 0;

    const result = buildTransactionCollectionResult([
      {
        id: "txn-visible",
        date: "2026-03-05",
        amount: -2500,
        payee_name: "Grocer",
        category_name: "Groceries",
        account_name: "Checking",
        approved: true,
        cleared: "cleared",
        get deleted() {
          visibleDeletedChecks += 1;
          return false;
        },
      },
      {
        id: "txn-deleted",
        date: "2026-03-04",
        amount: -1200,
        payee_name: "Cafe",
        category_name: "Dining",
        account_name: "Checking",
        approved: false,
        cleared: "uncleared",
        get deleted() {
          deletedDeletedChecks += 1;
          return true;
        },
      },
    ], {
      limit: 1,
      offset: 0,
    }, "transaction_count");

    expect(result).toMatchObject({
      transaction_count: 1,
      returned_count: 1,
    });
    expect(visibleDeletedChecks).toBe(1);
    expect(deletedDeletedChecks).toBe(1);
  });

  it("matches a reference model after command sequences update pagination and projection state", () => {
    fc.assert(fc.property(fc.array(queryCommandArbitrary, { maxLength: 20 }), (commands) => {
      const finalState = commands.reduce<QueryState>(applyCommand, {});

      expect(buildTransactionCollectionResult(baseTransactions, finalState, "transaction_count")).toEqual(
        buildReferenceTransactionCollectionResult(baseTransactions, finalState, "transaction_count"),
      );
    }));
  });

  it("keeps amount filters and transfer/date boundaries inclusive", () => {
    expect(matchesTransactionFilters({
      id: "txn-boundary",
      date: "2026-03-10",
      amount: -2500,
      transfer_account_id: undefined,
      payee_id: "payee-1",
      account_id: "account-1",
      category_id: "category-1",
      approved: true,
      cleared: "cleared",
    }, {
      minAmount: -2500,
      maxAmount: -2500,
      toDate: "2026-03-10",
      includeTransfers: false,
      payeeId: "payee-1",
      accountId: "account-1",
      categoryId: "category-1",
      approved: true,
      cleared: "cleared",
    })).toBe(true);

    expect(matchesTransactionFilters({
      id: "txn-transfer",
      date: "2026-03-10",
      amount: -2500,
      transfer_account_id: "transfer-1",
    }, {
      includeTransfers: false,
    })).toBe(false);
  });

  it("rejects mismatches for each explicit filter when one is provided", () => {
    const transaction = {
      id: "txn-filtered",
      date: "2026-03-10",
      amount: -2500,
      transfer_account_id: undefined,
      payee_id: "payee-1",
      account_id: "account-1",
      category_id: "category-1",
      approved: true,
      cleared: "cleared",
    } satisfies TransactionLike;

    expect(matchesTransactionFilters(transaction, {
      includeTransfers: true,
      toDate: "2026-03-09",
    })).toBe(false);
    expect(matchesTransactionFilters(transaction, {
      includeTransfers: true,
      payeeId: "payee-2",
    })).toBe(false);
    expect(matchesTransactionFilters(transaction, {
      includeTransfers: true,
      accountId: "account-2",
    })).toBe(false);
    expect(matchesTransactionFilters(transaction, {
      includeTransfers: true,
      categoryId: "category-2",
    })).toBe(false);
    expect(matchesTransactionFilters(transaction, {
      includeTransfers: true,
      approved: false,
    })).toBe(false);
    expect(matchesTransactionFilters(transaction, {
      includeTransfers: true,
      cleared: "uncleared",
    })).toBe(false);
    expect(matchesTransactionFilters(transaction, {
      includeTransfers: true,
      minAmount: -2400,
    })).toBe(false);
    expect(matchesTransactionFilters(transaction, {
      includeTransfers: true,
      maxAmount: -2600,
    })).toBe(false);
  });

  it("uses stable ordering rules for each supported sort mode", () => {
    expect(compareTransactions(
      { id: "txn-b", date: "2026-03-05", amount: -1500 },
      { id: "txn-a", date: "2026-03-05", amount: -1500 },
      "date_asc",
    )).toBeGreaterThan(0);

    expect(compareTransactions(
      { id: "txn-a", date: "2026-03-05", amount: -1500 },
      { id: "txn-b", date: "2026-03-05", amount: -1500 },
      "date_desc",
    )).toBeLessThan(0);

    expect(compareTransactions(
      { id: "txn-a", date: "2026-03-05", amount: -2000 },
      { id: "txn-b", date: "2026-03-04", amount: -1000 },
      "amount_asc",
    )).toBeLessThan(0);

    expect(compareTransactions(
      { id: "txn-a", date: "2026-03-05", amount: 2000 },
      { id: "txn-b", date: "2026-03-04", amount: 1000 },
      "amount_desc",
    )).toBeLessThan(0);
  });
});
