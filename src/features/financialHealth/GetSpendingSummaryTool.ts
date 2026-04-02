import { z } from "zod";
import * as ynab from "ynab";

import {
  buildAssignedSpentSummary,
  compactObject,
  formatMilliunits,
  isWithinMonthRange,
  normalizeMonthRange,
  toTopRollups,
} from "../../financeToolUtils.js";
import { getCachedCategories, getCachedPlanMonth, getCachedPlanMonths } from "../../cachedYnabReads.js";
import type { OutputFormat } from "../../runtimePlanToolUtils.js";
import { toErrorResult, toProseResult, toTextResult, withResolvedPlan } from "../../runtimePlanToolUtils.js";
import { buildProse, proseRecordItem } from "./proseFormatUtils.js";

export const name = "ynab_get_spending_summary";
export const description =
  "Returns a compact spending summary with assigned versus spent totals and top spending rollups.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  fromMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe(
    "The first month in ISO format or the string 'current'.",
  ),
  toMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).optional().describe(
    "The last month in ISO format. Defaults to fromMonth.",
  ),
  topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of top rollups to include."),
  format: z.enum(["compact", "pretty", "prose"]).default("compact").describe("Output format."),
};

function buildCategoryGroupLookup(categoryGroups: ynab.CategoryGroupWithCategories[]) {
  return new Map(
    categoryGroups.flatMap((group) => group.categories
      .filter((category) => !category.deleted)
      .map((category) => [category.id, group.name] as const)),
  );
}

function addRollup(
  bucket: Map<string, { id?: string | undefined; name: string; amountMilliunits: number; transactionCount: number }>,
  key: string,
  value: { id?: string | undefined; name: string; amountMilliunits: number },
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
  input: { planId?: string; fromMonth?: string; toMonth?: string; topN?: number; format?: OutputFormat },
  api: ynab.API,
) {
  try {
    const { fromMonth, toMonth } = normalizeMonthRange(input.fromMonth, input.toMonth);
    const topN = input.topN ?? 5;
    const isSingleMonth = fromMonth === toMonth;
    const format = input.format ?? "compact";

    return await withResolvedPlan(input.planId, api, async (planId) => {
      const [transactionsResponse, monthsResponse, categoriesResponse, monthResponse] = await Promise.all([
        api.transactions.getTransactions(planId, fromMonth, undefined, undefined),
        getCachedPlanMonths(api, planId),
        getCachedCategories(api, planId),
        isSingleMonth ? getCachedPlanMonth(api, planId, fromMonth) : Promise.resolve(undefined),
      ]);

      const groupByCategoryId = buildCategoryGroupLookup(categoriesResponse.data.category_groups);
      const categoryRollups = new Map<string, { id?: string; name: string; amountMilliunits: number; transactionCount: number }>();
      const categoryGroupRollups = new Map<string, { id?: string; name: string; amountMilliunits: number; transactionCount: number }>();
      const payeeRollups = new Map<string, { id?: string; name: string; amountMilliunits: number; transactionCount: number }>();

      const spendingTransactions = transactionsResponse.data.transactions.filter(
        (transaction) => !transaction.deleted
          && !transaction.transfer_account_id
          && transaction.amount < 0
          && isWithinMonthRange(transaction.date, fromMonth, toMonth),
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
      const monthCategoryBudgetById = new Map(
        monthResponse?.data.month.categories
          .filter((category) => !category.deleted)
          .map((category) => [category.id, category.budgeted ?? 0] as const) ?? [],
      );
      const topCategories = isSingleMonth
        ? Array.from(categoryRollups.values())
          .slice()
          .sort((left, right) => {
            const amountDifference = Math.abs(right.amountMilliunits) - Math.abs(left.amountMilliunits);
            if (amountDifference !== 0) {
              return amountDifference;
            }

            return left.name.localeCompare(right.name);
          })
          .slice(0, topN)
          .map((entry) => {
            const budgetedMilliunits = entry.id ? monthCategoryBudgetById.get(entry.id) : undefined;
            const varianceMilliunits = typeof budgetedMilliunits === "number"
              ? budgetedMilliunits - entry.amountMilliunits
              : undefined;
            const variancePercent = typeof budgetedMilliunits === "number" && budgetedMilliunits !== 0
              ? ((varianceMilliunits ?? 0) / budgetedMilliunits) * 100
              : undefined;

            return compactObject({
              id: entry.id,
              name: entry.name,
              amount: formatMilliunits(entry.amountMilliunits),
              transaction_count: entry.transactionCount,
              budgeted: typeof budgetedMilliunits === "number" ? formatMilliunits(budgetedMilliunits) : undefined,
              spent: formatMilliunits(entry.amountMilliunits),
              variance: typeof varianceMilliunits === "number" ? formatMilliunits(varianceMilliunits) : undefined,
              variance_pct: typeof variancePercent === "number" ? variancePercent.toFixed(2) : undefined,
            });
          })
        : toTopRollups(Array.from(categoryRollups.values()), topN);

      const payload = {
        from_month: fromMonth,
        to_month: toMonth,
        ...buildAssignedSpentSummary(assignedMilliunits, spentMilliunits),
        transaction_count: spendingTransactions.length,
        average_transaction: formatMilliunits(
          spendingTransactions.length > 0 ? Math.round(spentMilliunits / spendingTransactions.length) : 0,
        ),
        top_categories: topCategories,
        top_category_groups: toTopRollups(Array.from(categoryGroupRollups.values()), topN),
        top_payees: toTopRollups(Array.from(payeeRollups.values()), topN),
      };

      if (format === "prose") {
        return toProseResult(buildProse(
          `Spending Summary (${payload.from_month} to ${payload.to_month})`,
          [
            ["assigned", payload.assigned],
            ["spent", payload.spent],
            ["assigned_vs_spent", payload.assigned_vs_spent],
            ["transaction_count", payload.transaction_count],
            ["average_transaction", payload.average_transaction],
          ],
          [
            { heading: "Top Categories", items: payload.top_categories.map((entry) => proseRecordItem(entry, "name", "amount")) },
            { heading: "Top Payees", items: payload.top_payees.map((entry) => proseRecordItem(entry, "name", "amount")) },
          ],
        ));
      }

      return toTextResult(payload, format);
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
