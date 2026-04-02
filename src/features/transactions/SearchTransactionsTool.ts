import { z } from "zod";
import * as ynab from "ynab";

import {
  formatAmountMilliunits,
} from "../../tools/collectionToolUtils.js";
import { compactObject } from "../../tools/financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "../../runtimePlanToolUtils.js";
import {
  buildTransactionCollectionResult,
  compareTransactions,
  matchesTransactionFilters,
  transactionFields,
  type TransactionSort,
} from "./transactionQueryEngine.js";

const sortableValues = [
  "date_asc",
  "date_desc",
  "amount_asc",
  "amount_desc",
] as const;

export const name = "ynab_search_transactions";
export const description =
  "Transaction search with compact filters, projections, and pagination.";
export const inputSchema = {
  planId: z.string().optional().describe("Plan ID (uses env default)"),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Start date (ISO)"),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("End date (ISO)"),
  payeeId: z.string().optional().describe("Optional payee id filter."),
  accountId: z.string().optional().describe("Optional account id filter."),
  categoryId: z.string().optional().describe("Optional category id filter."),
  approved: z.boolean().optional().describe("Optional approval-state filter."),
  cleared: z.string().optional().describe("Optional cleared-state filter."),
  minAmount: z.number().optional().describe("Optional minimum amount in YNAB milliunits."),
  maxAmount: z.number().optional().describe("Optional maximum amount in YNAB milliunits."),
  includeTransfers: z.boolean().default(false).describe("When false, omits transfer transactions."),
  limit: z.number().int().min(1).max(500).default(50).describe("Max results"),
  offset: z.number().int().min(0).default(0).describe("Skip N results"),
  includeIds: z.boolean().optional().describe("Include IDs"),
  fields: z.array(z.enum(transactionFields)).optional().describe("Fields to include"),
  sort: z.enum(sortableValues).default("date_desc").describe("Sort order for matching transactions."),
};

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
    sort?: TransactionSort;
  },
  api: ynab.API,
) {
  try {
    const fromDate = input.fromDate;
    const sort: TransactionSort = input.sort ?? "date_desc";

    const response = await withResolvedPlan(input.planId, api, async (planId) => api.transactions.getTransactions(
      planId,
      fromDate,
      undefined,
      undefined,
    ));

    const matchingTransactions = response.data.transactions
      .filter((transaction) => !transaction.deleted)
      .filter((transaction) => matchesTransactionFilters(transaction, input))
      .sort((left, right) => compareTransactions(left, right, sort));

    return toTextResult({
      ...buildTransactionCollectionResult(
        matchingTransactions,
        input,
        "match_count",
      ),
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
