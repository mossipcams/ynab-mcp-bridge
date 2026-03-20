import { z } from "zod";
import * as ynab from "ynab";

import {
  formatAmountMilliunits,
  paginateEntries,
  projectRecord,
} from "./collectionToolUtils.js";
import { compactObject } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

const transactionFields = [
  "date",
  "amount",
  "payee_name",
  "category_name",
  "account_name",
  "approved",
  "cleared",
] as const;

const sortableValues = [
  "date_asc",
  "date_desc",
  "amount_asc",
  "amount_desc",
] as const;

type SearchableTransaction = {
  id: string;
  date: string;
  amount: number;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  approved?: boolean | null;
  cleared?: string | null;
  transfer_account_id?: string | null;
};

export const name = "ynab_search_transactions";
export const description =
  "Searches transactions with compact filters, projections, and pagination for AI-friendly drill-down.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Optional inclusive start date."),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Optional inclusive end date."),
  payeeId: z.string().optional().describe("Optional payee id filter."),
  accountId: z.string().optional().describe("Optional account id filter."),
  categoryId: z.string().optional().describe("Optional category id filter."),
  approved: z.boolean().optional().describe("Optional approval-state filter."),
  cleared: z.string().optional().describe("Optional cleared-state filter."),
  minAmount: z.number().optional().describe("Optional minimum amount in YNAB milliunits."),
  maxAmount: z.number().optional().describe("Optional maximum amount in YNAB milliunits."),
  includeTransfers: z.boolean().default(false).describe("When false, omits transfer transactions."),
  limit: z.number().int().min(1).max(500).default(50).describe("Maximum number of transactions to return."),
  offset: z.number().int().min(0).default(0).describe("Number of matching transactions to skip."),
  includeIds: z.boolean().optional().describe("When false, omits transaction ids from the output."),
  fields: z.array(z.enum(transactionFields)).optional().describe("Optional transaction fields to include in each row."),
  sort: z.enum(sortableValues).default("date_desc").describe("Sort order for matching transactions."),
};

function matchesFilters(
  transaction: SearchableTransaction,
  input: {
    toDate?: string;
    payeeId?: string;
    accountId?: string;
    categoryId?: string;
    approved?: boolean;
    cleared?: string;
    minAmount?: number;
    maxAmount?: number;
    includeTransfers?: boolean;
  },
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

function compareTransactions(
  left: SearchableTransaction,
  right: SearchableTransaction,
  sort: (typeof sortableValues)[number],
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

export async function execute(
  input: {
    planId?: string;
    fromDate?: string;
    toDate?: string;
    payeeId?: string;
    accountId?: string;
    categoryId?: string;
    approved?: boolean;
    cleared?: string;
    minAmount?: number;
    maxAmount?: number;
    includeTransfers?: boolean;
    limit?: number;
    offset?: number;
    includeIds?: boolean;
    fields?: Array<(typeof transactionFields)[number]>;
    sort?: (typeof sortableValues)[number];
  },
  api: ynab.API,
) {
  try {
    const fromDate = input.fromDate;
    const sort = input.sort ?? "date_desc";

    const response = await withResolvedPlan(input.planId, api, async (planId) => api.transactions.getTransactions(
      planId,
      fromDate,
      undefined,
      undefined,
    ));

    const transactions = response.data.transactions
      .filter((transaction) => !transaction.deleted)
      .filter((transaction) => matchesFilters(transaction as SearchableTransaction, input))
      .sort((left, right) => compareTransactions(left as SearchableTransaction, right as SearchableTransaction, sort))
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

    const pagedTransactions = paginateEntries(transactions, input);

    return toTextResult({
      transactions: pagedTransactions.entries.map((transaction) => projectRecord(transaction, transactionFields, input)),
      match_count: transactions.length,
      ...pagedTransactions.metadata,
      filters: compactObject({
        from_date: input.fromDate,
        to_date: input.toDate,
        payee_id: input.payeeId,
        account_id: input.accountId,
        category_id: input.categoryId,
        approved: input.approved,
        cleared: input.cleared,
        min_amount: input.minAmount == null ? undefined : formatAmountMilliunits(input.minAmount),
        max_amount: input.maxAmount == null ? undefined : formatAmountMilliunits(input.maxAmount),
        include_transfers: input.includeTransfers ?? false,
        sort,
      }),
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
