import { z } from "zod";
import * as ynab from "ynab";

import {
  averageMonthlySpendingMilliunits,
  formatAmount,
  liquidCashMilliunits,
  recentMonths,
  scheduledNetNext30dMilliunits,
} from "./financialDiagnosticsUtils.js";
import { getCachedAccounts, getCachedPlanMonths, getCachedScheduledTransactions } from "./cachedYnabReads.js";
import { compactObject } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const name = "ynab_get_emergency_fund_coverage";
export const description =
  "Estimates how many months of recent spending your liquid cash can cover.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  asOfMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("The month to anchor coverage calculations."),
  monthsBack: z.number().int().min(1).max(12).default(3).describe("How many trailing months to average."),
};

function getCoverageStatus(coverageMonths: number | null): "critical" | "no_spending" | "solid" | "strong" | "thin" {
  if (coverageMonths === null) {
    return "no_spending";
  }

  if (coverageMonths >= 6) {
    return "strong";
  }

  if (coverageMonths >= 3) {
    return "solid";
  }

  if (coverageMonths >= 1) {
    return "thin";
  }

  return "critical";
}

export async function execute(
  input: { planId?: string; asOfMonth: string; monthsBack?: number },
  api: ynab.API,
) {
  try {
    const monthsBack = input.monthsBack ?? 3;
    return await withResolvedPlan(input.planId, api, async (planId) => {
      const [accountsResponse, monthsResponse, scheduledResponse] = await Promise.all([
        getCachedAccounts(api, planId),
        getCachedPlanMonths(api, planId),
        getCachedScheduledTransactions(api, planId),
      ]);

      const liquidCash = liquidCashMilliunits(accountsResponse.data.accounts);
      const months = recentMonths(monthsResponse.data.months, input.asOfMonth, monthsBack);
      const averageMonthlySpending = averageMonthlySpendingMilliunits(months);
      const scheduledNetNext30d = scheduledNetNext30dMilliunits(
        scheduledResponse.data.scheduled_transactions,
        input.asOfMonth,
      );
      const noSpending = averageMonthlySpending === 0;
      const coverageMonths = noSpending ? null : liquidCash / averageMonthlySpending;
      const status = getCoverageStatus(coverageMonths);

      return toTextResult(compactObject({
        as_of_month: input.asOfMonth,
        liquid_cash: formatAmount(liquidCash),
        average_monthly_spending: formatAmount(averageMonthlySpending),
        scheduled_net_next_30d: formatAmount(scheduledNetNext30d),
        coverage_months: coverageMonths !== null ? coverageMonths.toFixed(2) : undefined,
        status,
        months_considered: months.length,
      }));
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
