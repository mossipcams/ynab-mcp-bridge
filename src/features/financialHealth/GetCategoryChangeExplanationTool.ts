import { z } from "zod";
import * as ynab from "ynab";

import { compactObject, formatMilliunits, isWithinMonthRange, normalizeMonthRange } from "../../financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "../../runtimePlanToolUtils.js";

type Rollup = {
  id: string | undefined;
  name: string;
  periodASpentMilliunits: number;
  periodBSpentMilliunits: number;
};

type PeriodRange = {
  fromMonth: string;
  toMonth: string;
};

type CategoryChangeSummary = {
  categoryName: string;
  payeeDrivers: Map<string, Rollup>;
  periodASpentMilliunits: number;
  periodATransactionCount: number;
  periodBSpentMilliunits: number;
  periodBTransactionCount: number;
};

const directionFor = (value: number) => value >= 0 ? "increase" : "decrease";

type CategoryTransaction = {
  amount: number;
  category_id?: string | null;
  category_name?: string | null;
  date: string;
  deleted: boolean;
  payee_id?: string | null;
  payee_name?: string | null;
  transfer_account_id?: string | null;
};

function addRollup(
  bucket: Map<string, Rollup>,
  key: string,
  value: Rollup,
) {
  const current = bucket.get(key);

  if (current) {
    current.periodASpentMilliunits += value.periodASpentMilliunits;
    current.periodBSpentMilliunits += value.periodBSpentMilliunits;
    return;
  }

  bucket.set(key, value);
}

function buildDriverPayload(entries: Rollup[], topN: number) {
  return entries
    .map((entry) => ({ ...entry, changeMilliunits: entry.periodBSpentMilliunits - entry.periodASpentMilliunits }))
    .filter((entry) => entry.changeMilliunits !== 0)
    .sort((left, right) => Math.abs(right.changeMilliunits) - Math.abs(left.changeMilliunits) || left.name.localeCompare(right.name))
    .slice(0, topN)
    .map((entry) => compactObject({
      id: entry.id,
      name: entry.name,
      period_a_spent: formatMilliunits(entry.periodASpentMilliunits),
      period_b_spent: formatMilliunits(entry.periodBSpentMilliunits),
      change: formatMilliunits(Math.abs(entry.changeMilliunits)),
      change_direction: directionFor(entry.changeMilliunits),
    }));
}

function buildPeriodSummary(range: PeriodRange, spentMilliunits: number, transactionCount: number) {
  return {
    from_month: range.fromMonth,
    to_month: range.toMonth,
    spent: formatMilliunits(spentMilliunits),
    transaction_count: transactionCount,
  };
}

function isRelevantCategoryTransaction(transaction: CategoryTransaction, categoryId: string) {
  return !transaction.deleted
    && !transaction.transfer_account_id
    && transaction.amount < 0
    && transaction.category_id === categoryId;
}

function applyCategoryTransactionToSummary(
  summary: CategoryChangeSummary,
  transaction: CategoryTransaction,
  periodA: PeriodRange,
  periodB: PeriodRange,
) {
  summary.categoryName = transaction.category_name ?? summary.categoryName;
  const spendMilliunits = Math.abs(transaction.amount);
  const inPeriodA = isWithinMonthRange(transaction.date, periodA.fromMonth, periodA.toMonth);
  const inPeriodB = isWithinMonthRange(transaction.date, periodB.fromMonth, periodB.toMonth);

  if (!inPeriodA && !inPeriodB) {
    return;
  }

  if (inPeriodA) {
    summary.periodASpentMilliunits += spendMilliunits;
    summary.periodATransactionCount += 1;
  }

  if (inPeriodB) {
    summary.periodBSpentMilliunits += spendMilliunits;
    summary.periodBTransactionCount += 1;
  }

  addRollup(summary.payeeDrivers, transaction.payee_id ?? "unknown-payee", {
    id: transaction.payee_id ?? undefined,
    name: transaction.payee_name ?? "Unknown Payee",
    periodASpentMilliunits: inPeriodA ? spendMilliunits : 0,
    periodBSpentMilliunits: inPeriodB ? spendMilliunits : 0,
  });
}

function summarizeCategoryChange(
  transactions: readonly CategoryTransaction[],
  categoryId: string,
  periodA: PeriodRange,
  periodB: PeriodRange,
): CategoryChangeSummary {
  const summary: CategoryChangeSummary = {
    categoryName: "Unknown Category",
    payeeDrivers: new Map<string, Rollup>(),
    periodASpentMilliunits: 0,
    periodATransactionCount: 0,
    periodBSpentMilliunits: 0,
    periodBTransactionCount: 0,
  };

  for (const transaction of transactions) {
    if (!isRelevantCategoryTransaction(transaction, categoryId)) {
      continue;
    }
    applyCategoryTransactionToSummary(summary, transaction, periodA, periodB);
  }

  return summary;
}

export const name = "ynab_get_category_change_explanation";
export const description = "Explains change for a single category across two periods with compact payee drivers.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  categoryId: z.string().describe("The category id to explain."),
  periodAFromMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).describe("The first month in period A."),
  periodAToMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).optional().describe("The last month in period A. Defaults to periodAFromMonth."),
  periodBFromMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).describe("The first month in period B."),
  periodBToMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).optional().describe("The last month in period B. Defaults to periodBFromMonth."),
  topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of payee drivers to include."),
};

export async function execute(
  input: {
    planId?: string;
    categoryId: string;
    periodAFromMonth: string;
    periodAToMonth?: string;
    periodBFromMonth: string;
    periodBToMonth?: string;
    topN?: number;
  },
  api: ynab.API,
) {
  try {
    const periodA = normalizeMonthRange(input.periodAFromMonth, input.periodAToMonth);
    const periodB = normalizeMonthRange(input.periodBFromMonth, input.periodBToMonth);
    const earliestMonth = [periodA.fromMonth, periodB.fromMonth].sort()[0]!;
    const topN = input.topN ?? 5;

    return await withResolvedPlan(input.planId, api, async (planId) => {
      const response = await api.transactions.getTransactions(planId, earliestMonth, undefined, undefined);
      const summary = summarizeCategoryChange(response.data.transactions, input.categoryId, periodA, periodB);
      const changeMilliunits = summary.periodBSpentMilliunits - summary.periodASpentMilliunits;

      return toTextResult({
        category_id: input.categoryId,
        category_name: summary.categoryName,
        period_a: buildPeriodSummary(periodA, summary.periodASpentMilliunits, summary.periodATransactionCount),
        period_b: buildPeriodSummary(periodB, summary.periodBSpentMilliunits, summary.periodBTransactionCount),
        change: compactObject({
          amount: formatMilliunits(Math.abs(changeMilliunits)),
          direction: directionFor(changeMilliunits),
          percent: summary.periodASpentMilliunits === 0
            ? undefined
            : ((changeMilliunits / summary.periodASpentMilliunits) * 100).toFixed(2),
        }),
        top_payee_drivers: buildDriverPayload(Array.from(summary.payeeDrivers.values()), topN),
      });
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
