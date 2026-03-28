import { z } from "zod";
import * as ynab from "ynab";

import { formatAmount } from "./financialDiagnosticsUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./runtimePlanToolUtils.js";

type RecurringCandidate = {
  payeeId?: string | null | undefined;
  payeeName: string;
  dates: string[];
  amounts: number[];
};

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function detectCadence(dates: string[]) {
  if (dates.length < 3) {
    return undefined;
  }

  const sortedDates = dates.slice().sort((left, right) => left.localeCompare(right));
  const intervals = sortedDates.slice(1).map((date, index) => {
    const previous = new Date(`${sortedDates[index]}T00:00:00.000Z`);
    const current = new Date(`${date}T00:00:00.000Z`);
    return Math.round((current.getTime() - previous.getTime()) / 86_400_000);
  });
  const averageInterval = average(intervals);

  if (averageInterval >= 25 && averageInterval <= 35) {
    return "monthly";
  }

  return undefined;
}

export const name = "ynab_get_recurring_expense_summary";
export const description =
  "Infers recurring expenses from transaction history and estimates their monthly cost.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Inclusive start date for transaction history."),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Inclusive end date for transaction history."),
  topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of recurring expenses to include."),
};

export async function execute(
  input: { planId?: string; fromDate: string; toDate: string; topN?: number },
  api: ynab.API,
) {
  try {
    const topN = input.topN ?? 5;
    return await withResolvedPlan(input.planId, api, async (planId) => {
      const response = await api.transactions.getTransactions(planId, input.fromDate, undefined, undefined);
      const candidates = new Map<string, RecurringCandidate>();

      for (const transaction of response.data.transactions) {
        if (
          transaction.deleted
          || transaction.transfer_account_id
          || transaction.amount >= 0
          || transaction.date < input.fromDate
          || transaction.date > input.toDate
        ) {
          continue;
        }

        const key = transaction.payee_id ?? transaction.payee_name ?? "unknown-payee";
        const candidate: RecurringCandidate = candidates.get(key) ?? {
          payeeId: transaction.payee_id,
          payeeName: transaction.payee_name ?? "Unknown Payee",
          dates: [],
          amounts: [],
        };
        candidate.dates.push(transaction.date);
        candidate.amounts.push(Math.abs(transaction.amount));
        candidates.set(key, candidate);
      }

      const recurringExpenses = Array.from(candidates.values())
        .map((candidate) => {
          const cadence = detectCadence(candidate.dates);
          if (!cadence) {
            return undefined;
          }

          const averageAmount = Math.round(average(candidate.amounts));
          const estimatedMonthlyCost = cadence === "monthly" ? averageAmount : 0;

          return {
            payee_id: candidate.payeeId ?? undefined,
            payee_name: candidate.payeeName,
            cadence,
            occurrence_count: candidate.dates.length,
            average_amount: formatAmount(averageAmount),
            estimated_monthly_cost: formatAmount(estimatedMonthlyCost),
            annualized_cost: formatAmount(estimatedMonthlyCost * 12),
            sort_amount: estimatedMonthlyCost,
          };
        })
        .filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate)
        .sort((left, right) => right.sort_amount - left.sort_amount)
        .slice(0, topN)
        .map(({ sort_amount: _sortAmount, ...candidate }) => candidate);

      return toTextResult({
        from_date: input.fromDate,
        to_date: input.toDate,
        recurring_expense_count: recurringExpenses.length,
        recurring_expenses: recurringExpenses,
      });
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
