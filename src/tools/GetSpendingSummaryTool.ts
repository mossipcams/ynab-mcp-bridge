import { z } from "zod";
import * as ynab from "ynab";

import { buildAssignedSpentSummary, formatMilliunits, toTopRollups } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const name = "ynab_get_spending_summary";
export const description =
  "Returns a compact spending summary with assigned versus spent totals and top spending rollups.";
export const inputSchema = {
  planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
  fromMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe(
    "Start month as YYYY-MM-DD or 'current'.",
  ),
  toMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).optional().describe(
    "End month as YYYY-MM-DD. Defaults to fromMonth.",
  ),
  topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of top rollups to include."),
};

function toMonthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map((value) => Number.parseInt(value, 10));
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function isWithinRange(date: string, fromMonth: string, toMonth: string) {
  return date >= fromMonth && date <= toMonthEnd(toMonth);
}

function buildCategoryGroupLookup(categoryGroups: ynab.CategoryGroupWithCategories[]) {
  return new Map(
    categoryGroups.flatMap((group) => group.categories
      .filter((category) => !category.deleted)
      .map((category) => [category.id, group.name] as const)),
  );
}

function addRollup(
  bucket: Map<string, { id?: string; name: string; amountMilliunits: number; transactionCount: number }>,
  key: string,
  value: { id?: string; name: string; amountMilliunits: number },
) {
  const current = bucket.get(key);

  if (current) {
    current.amountMilliunits += value.amountMilliunits;
    current.transactionCount += 1;
    return;
  }

  bucket.set(key, {
    id: value.id,
    name: value.name,
    amountMilliunits: value.amountMilliunits,
    transactionCount: 1,
  });
}

export async function execute(
  input: { planId?: string; fromMonth?: string; toMonth?: string; topN?: number },
  api: ynab.API,
) {
  try {
    const fromMonth = input.fromMonth || "current";
    const toMonth = input.toMonth || fromMonth;
    const topN = input.topN ?? 5;

    return await withResolvedPlan(input.planId, api, async (planId) => {
      const [transactionsResponse, monthsResponse, categoriesResponse] = await Promise.all([
        api.transactions.getTransactions(planId, fromMonth, undefined, undefined),
        api.months.getPlanMonths(planId),
        api.categories.getCategories(planId),
      ]);

      const groupByCategoryId = buildCategoryGroupLookup(categoriesResponse.data.category_groups);
      const categoryRollups = new Map<string, { id?: string; name: string; amountMilliunits: number; transactionCount: number }>();
      const categoryGroupRollups = new Map<string, { id?: string; name: string; amountMilliunits: number; transactionCount: number }>();
      const payeeRollups = new Map<string, { id?: string; name: string; amountMilliunits: number; transactionCount: number }>();

      const spendingTransactions = transactionsResponse.data.transactions.filter(
        (transaction) => !transaction.deleted
          && !transaction.transfer_account_id
          && transaction.amount < 0
          && isWithinRange(transaction.date, fromMonth, toMonth),
      );

      for (const transaction of spendingTransactions) {
        const spendMilliunits = Math.abs(transaction.amount);
        const categoryId = transaction.category_id ?? "uncategorized";
        const categoryName = transaction.category_name ?? "Uncategorized";
        const groupName = groupByCategoryId.get(categoryId) ?? "Uncategorized";
        const payeeId = transaction.payee_id ?? "unknown-payee";
        const payeeName = transaction.payee_name ?? "Unknown Payee";

        addRollup(categoryRollups, categoryId, {
          id: transaction.category_id ?? undefined,
          name: categoryName,
          amountMilliunits: spendMilliunits,
        });
        addRollup(categoryGroupRollups, groupName, {
          name: groupName,
          amountMilliunits: spendMilliunits,
        });
        addRollup(payeeRollups, payeeId, {
          id: transaction.payee_id ?? undefined,
          name: payeeName,
          amountMilliunits: spendMilliunits,
        });
      }

      const assignedMilliunits = monthsResponse.data.months
        .filter((month) => !month.deleted && month.month >= fromMonth && month.month <= toMonth)
        .reduce((sum, month) => sum + month.budgeted, 0);
      const spentMilliunits = spendingTransactions.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);

      return toTextResult({
        from_month: fromMonth,
        to_month: toMonth,
        ...buildAssignedSpentSummary(assignedMilliunits, spentMilliunits),
        transaction_count: spendingTransactions.length,
        average_transaction: formatMilliunits(
          spendingTransactions.length > 0 ? Math.round(spentMilliunits / spendingTransactions.length) : 0,
        ),
        top_categories: toTopRollups(Array.from(categoryRollups.values()), topN),
        top_category_groups: toTopRollups(Array.from(categoryGroupRollups.values()), topN),
        top_payees: toTopRollups(Array.from(payeeRollups.values()), topN),
      });
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
