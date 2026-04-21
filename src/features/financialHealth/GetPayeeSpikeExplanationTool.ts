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

type PayeeSpikeSummary = {
  accountDrivers: Map<string, Rollup>;
  categoryDrivers: Map<string, Rollup>;
  payeeName: string;
  periodASpentMilliunits: number;
  periodATransactionCount: number;
  periodBSpentMilliunits: number;
  periodBTransactionCount: number;
};

const directionFor = (value: number) => value >= 0 ? "increase" : "decrease";

type PayeeTransaction = {
  account_id?: string | null;
  account_name?: string | null;
  amount: number;
  category_id?: string | null;
  category_name?: string | null;
  date: string;
  deleted: boolean;
  payee_id?: string | null;
  payee_name?: string | null;
  transfer_account_id?: string | null;
};

function addRollup(bucket: Map<string, Rollup>, key: string, value: Rollup) {
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

function isRelevantPayeeTransaction(transaction: PayeeTransaction, payeeId: string) {
  return !transaction.deleted
    && !transaction.transfer_account_id
    && transaction.amount < 0
    && transaction.payee_id === payeeId;
}

function applyPayeeTransactionToSummary(
  summary: PayeeSpikeSummary,
  transaction: PayeeTransaction,
  periodA: PeriodRange,
  periodB: PeriodRange,
) {
  summary.payeeName = transaction.payee_name ?? summary.payeeName;
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

  addRollup(summary.categoryDrivers, transaction.category_id ?? "uncategorized", {
    id: transaction.category_id ?? undefined,
    name: transaction.category_name ?? "Uncategorized",
    periodASpentMilliunits: inPeriodA ? spendMilliunits : 0,
    periodBSpentMilliunits: inPeriodB ? spendMilliunits : 0,
  });
  addRollup(summary.accountDrivers, transaction.account_id ?? "unknown-account", {
    id: transaction.account_id ?? undefined,
    name: transaction.account_name ?? "Unknown Account",
    periodASpentMilliunits: inPeriodA ? spendMilliunits : 0,
    periodBSpentMilliunits: inPeriodB ? spendMilliunits : 0,
  });
}

function summarizePayeeSpike(
  transactions: readonly PayeeTransaction[],
  payeeId: string,
  periodA: PeriodRange,
  periodB: PeriodRange,
): PayeeSpikeSummary {
  const summary: PayeeSpikeSummary = {
    accountDrivers: new Map<string, Rollup>(),
    categoryDrivers: new Map<string, Rollup>(),
    payeeName: "Unknown Payee",
    periodASpentMilliunits: 0,
    periodATransactionCount: 0,
    periodBSpentMilliunits: 0,
    periodBTransactionCount: 0,
  };

  for (const transaction of transactions) {
    if (!isRelevantPayeeTransaction(transaction, payeeId)) {
      continue;
    }
    applyPayeeTransactionToSummary(summary, transaction, periodA, periodB);
  }

  return summary;
}

export const name = "ynab_get_payee_spike_explanation";
export const description = "Explains a payee spike across two periods with compact category and account drivers.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  payeeId: z.string().describe("The payee id to explain."),
  periodAFromMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).describe("The first month in period A."),
  periodAToMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).optional().describe("The last month in period A. Defaults to periodAFromMonth."),
  periodBFromMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).describe("The first month in period B."),
  periodBToMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).optional().describe("The last month in period B. Defaults to periodBFromMonth."),
  topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of category and account drivers to include."),
};

export async function execute(
  input: {
    planId?: string;
    payeeId: string;
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
      const summary = summarizePayeeSpike(response.data.transactions, input.payeeId, periodA, periodB);
      const changeMilliunits = summary.periodBSpentMilliunits - summary.periodASpentMilliunits;
      return toTextResult({
        payee_id: input.payeeId,
        payee_name: summary.payeeName,
        period_a: buildPeriodSummary(periodA, summary.periodASpentMilliunits, summary.periodATransactionCount),
        period_b: buildPeriodSummary(periodB, summary.periodBSpentMilliunits, summary.periodBTransactionCount),
        change: compactObject({
          amount: formatMilliunits(Math.abs(changeMilliunits)),
          direction: directionFor(changeMilliunits),
          percent: summary.periodASpentMilliunits === 0
            ? undefined
            : ((changeMilliunits / summary.periodASpentMilliunits) * 100).toFixed(2),
        }),
        top_category_drivers: buildDriverPayload(Array.from(summary.categoryDrivers.values()), topN),
        top_account_drivers: buildDriverPayload(Array.from(summary.accountDrivers.values()), topN),
      });
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
