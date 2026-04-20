import { z } from "zod";
import * as ynab from "ynab";

import {
  compactObject,
  formatMilliunits,
  isWithinMonthRange,
  normalizeMonthRange,
} from "../../financeToolUtils.js";
import { createAnalysisSession, getAnalysisSession } from "../../financialAnalysisState.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "../../runtimePlanToolUtils.js";

type DriverRollup = {
  id: string | undefined;
  name: string;
  periodASpentMilliunits: number;
  periodBSpentMilliunits: number;
};

type PeriodRange = {
  fromMonth: string;
  toMonth: string;
};

type DriverPayload = {
  change: string;
  change_direction: "increase" | "decrease";
  id?: string;
  name: string;
  period_a_spent: string;
  period_b_spent: string;
};

type SpendingChangeAnalysisPayload = {
  topCategoryDrivers: DriverPayload[];
  topPayeeDrivers: DriverPayload[];
};

type SpendingChangeSummary = {
  categoryDrivers: Map<string, DriverRollup>;
  payeeDrivers: Map<string, DriverRollup>;
  periodASpentMilliunits: number;
  periodATransactionCount: number;
  periodBSpentMilliunits: number;
  periodBTransactionCount: number;
};

const rollupDirection = (value: number) => value >= 0 ? "increase" : "decrease";

type SpendingTransaction = {
  amount: number;
  category_id?: string | null;
  category_name?: string | null;
  date: string;
  deleted: boolean;
  payee_id?: string | null;
  payee_name?: string | null;
  transfer_account_id?: string | null;
};

export const name = "ynab_get_spending_change_explanation";
export const description =
  "Explains spending change between two periods with compact category and payee drivers for drill-down.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  analysisToken: z.string().optional().describe("Token returned by a prior spending change explanation for server-side refinement."),
  periodAFromMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).describe("The first month in period A."),
  periodAToMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).optional().describe("The last month in period A. Defaults to periodAFromMonth."),
  periodBFromMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).describe("The first month in period B."),
  periodBToMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).optional().describe("The last month in period B. Defaults to periodBFromMonth."),
  topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of category and payee drivers to include."),
  focusType: z.enum(["category", "payee"]).optional().describe("Optional driver type to refine from a prior spending change explanation."),
  focusId: z.string().optional().describe("Optional category or payee id used with analysisToken refinement."),
};

function buildFocusPayload(entry: DriverPayload) {
  return {
    ...entry.id ? { id: entry.id } : {},
    name: entry.name,
    period_a_spent: entry.period_a_spent,
    period_b_spent: entry.period_b_spent,
    change: entry.change,
    change_direction: entry.change_direction,
  };
}

function addDriverRollup(
  bucket: Map<string, DriverRollup>,
  key: string,
  value: { id: string | undefined; name: string; periodASpentMilliunits: number; periodBSpentMilliunits: number },
) {
  const current = bucket.get(key);

  if (current) {
    current.periodASpentMilliunits += value.periodASpentMilliunits;
    current.periodBSpentMilliunits += value.periodBSpentMilliunits;
    return;
  }

  bucket.set(key, {
    id: value.id,
    name: value.name,
    periodASpentMilliunits: value.periodASpentMilliunits,
    periodBSpentMilliunits: value.periodBSpentMilliunits,
  });
}

function buildDriverPayload(entries: DriverRollup[], topN: number) {
  return entries
    .map((entry) => ({
      ...entry,
      changeMilliunits: entry.periodBSpentMilliunits - entry.periodASpentMilliunits,
    }))
    .filter((entry) => entry.changeMilliunits !== 0)
    .sort((left, right) => {
      const changeDifference = Math.abs(right.changeMilliunits) - Math.abs(left.changeMilliunits);
      if (changeDifference !== 0) {
        return changeDifference;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, topN)
    .map((entry): DriverPayload => ({
      ...entry.id ? { id: entry.id } : {},
      name: entry.name,
      period_a_spent: formatMilliunits(entry.periodASpentMilliunits),
      period_b_spent: formatMilliunits(entry.periodBSpentMilliunits),
      change: formatMilliunits(Math.abs(entry.changeMilliunits)),
      change_direction: rollupDirection(entry.changeMilliunits),
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

function getEarliestMonth(...months: string[]) {
  return months.slice().sort((left, right) => left.localeCompare(right))[0]!;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDriverPayload(value: unknown): value is DriverPayload {
  return isRecord(value)
    && typeof value["name"] === "string"
    && typeof value["period_a_spent"] === "string"
    && typeof value["period_b_spent"] === "string"
    && typeof value["change"] === "string"
    && (
      value["change_direction"] === "increase"
      || value["change_direction"] === "decrease"
    )
    && (
      value["id"] === undefined
      || typeof value["id"] === "string"
    );
}

function isSpendingChangeAnalysisPayload(value: unknown): value is SpendingChangeAnalysisPayload {
  if (!isRecord(value)) {
    return false;
  }

  return Array.isArray(value["topCategoryDrivers"])
    && value["topCategoryDrivers"].every(isDriverPayload)
    && Array.isArray(value["topPayeeDrivers"])
    && value["topPayeeDrivers"].every(isDriverPayload);
}

function resolveRefinement(
  session: ReturnType<typeof getAnalysisSession>,
  focusType: "category" | "payee" | undefined,
  focusId: string | undefined,
) {
  if (!session || session.kind !== "spending_change") {
    throw new Error("Analysis token is invalid or has expired.");
  }
  if (!focusType || !focusId) {
    throw new Error("Analysis token refinement requires focusType and focusId.");
  }
  if (!isSpendingChangeAnalysisPayload(session.payload)) {
    throw new Error("Analysis token payload is invalid.");
  }

  const focusEntries = focusType === "category"
    ? session.payload.topCategoryDrivers
    : session.payload.topPayeeDrivers;
  const focus = focusEntries.find((entry) => entry.id === focusId);

  if (!focus) {
    throw new Error(`No ${focusType} driver found for ${focusId}.`);
  }

  return {
    focus,
    focusId,
    focusType,
    sessionToken: session.token,
  };
}

function isRelevantSpendingTransaction(transaction: SpendingTransaction) {
  return !transaction.deleted
    && !transaction.transfer_account_id
    && transaction.amount < 0;
}

function applySpendingTransactionToSummary(
  summary: SpendingChangeSummary,
  transaction: SpendingTransaction,
  periodA: PeriodRange,
  periodB: PeriodRange,
) {
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

  addDriverRollup(summary.categoryDrivers, transaction.category_id ?? "uncategorized", {
    id: transaction.category_id ?? undefined,
    name: transaction.category_name ?? "Uncategorized",
    periodASpentMilliunits: inPeriodA ? spendMilliunits : 0,
    periodBSpentMilliunits: inPeriodB ? spendMilliunits : 0,
  });
  addDriverRollup(summary.payeeDrivers, transaction.payee_id ?? "unknown-payee", {
    id: transaction.payee_id ?? undefined,
    name: transaction.payee_name ?? "Unknown Payee",
    periodASpentMilliunits: inPeriodA ? spendMilliunits : 0,
    periodBSpentMilliunits: inPeriodB ? spendMilliunits : 0,
  });
}

function summarizeSpendingChange(
  transactions: readonly SpendingTransaction[],
  periodA: PeriodRange,
  periodB: PeriodRange,
): SpendingChangeSummary {
  const summary: SpendingChangeSummary = {
    categoryDrivers: new Map<string, DriverRollup>(),
    payeeDrivers: new Map<string, DriverRollup>(),
    periodASpentMilliunits: 0,
    periodATransactionCount: 0,
    periodBSpentMilliunits: 0,
    periodBTransactionCount: 0,
  };

  for (const transaction of transactions) {
    if (!isRelevantSpendingTransaction(transaction)) {
      continue;
    }
    applySpendingTransactionToSummary(summary, transaction, periodA, periodB);
  }

  return summary;
}

export async function execute(
  input: {
    planId?: string;
    analysisToken?: string;
    periodAFromMonth: string;
    periodAToMonth?: string;
    periodBFromMonth: string;
    periodBToMonth?: string;
    topN?: number;
    focusType?: "category" | "payee";
    focusId?: string;
  },
  api: ynab.API,
) {
  try {
    if (input.analysisToken) {
      const refinement = resolveRefinement(
        getAnalysisSession(api, input.analysisToken),
        input.focusType,
        input.focusId,
      );

      return toTextResult({
        analysis_token: refinement.sessionToken,
        focus_type: refinement.focusType,
        focus_id: refinement.focusId,
        focus: buildFocusPayload(refinement.focus),
      });
    }

    const periodA = normalizeMonthRange(input.periodAFromMonth, input.periodAToMonth);
    const periodB = normalizeMonthRange(input.periodBFromMonth, input.periodBToMonth);
    const topN = input.topN ?? 5;
    const earliestMonth = getEarliestMonth(periodA.fromMonth, periodB.fromMonth);

    return await withResolvedPlan(input.planId, api, async (planId) => {
      const response = await api.transactions.getTransactions(planId, earliestMonth, undefined, undefined);
      const summary = summarizeSpendingChange(response.data.transactions, periodA, periodB);
      const changeMilliunits = summary.periodBSpentMilliunits - summary.periodASpentMilliunits;
      const changePercent = summary.periodASpentMilliunits === 0
        ? undefined
        : ((changeMilliunits / summary.periodASpentMilliunits) * 100).toFixed(2);
      const topCategoryDrivers = buildDriverPayload(Array.from(summary.categoryDrivers.values()), topN);
      const topPayeeDrivers = buildDriverPayload(Array.from(summary.payeeDrivers.values()), topN);
      const session = createAnalysisSession(api, {
        kind: "spending_change",
        planId,
        payload: {
          topCategoryDrivers,
          topPayeeDrivers,
        } satisfies SpendingChangeAnalysisPayload,
      });

      return toTextResult({
        analysis_token: session.token,
        period_a: buildPeriodSummary(periodA, summary.periodASpentMilliunits, summary.periodATransactionCount),
        period_b: buildPeriodSummary(periodB, summary.periodBSpentMilliunits, summary.periodBTransactionCount),
        change: compactObject({
          amount: formatMilliunits(Math.abs(changeMilliunits)),
          direction: rollupDirection(changeMilliunits),
          percent: changePercent,
        }),
        top_category_drivers: topCategoryDrivers,
        top_payee_drivers: topPayeeDrivers,
      });
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
