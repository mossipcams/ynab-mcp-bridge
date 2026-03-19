import { z } from "zod";
import * as ynab from "ynab";

import {
  averageDailyOutflowMilliunits,
  formatAmount,
  liquidCashMilliunits,
  recentMonths,
} from "./financialDiagnosticsUtils.js";
import { compactObject } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const name = "ynab_get_cash_runway";
export const description =
  "Estimates how many days your liquid cash can cover based on recent outflows.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  asOfMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("The month to anchor runway calculations."),
  monthsBack: z.number().int().min(1).max(12).default(3).describe("How many trailing months to average."),
};

export async function execute(
  input: { planId?: string; asOfMonth: string; monthsBack?: number },
  api: ynab.API,
) {
  try {
    const monthsBack = input.monthsBack ?? 3;
    return await withResolvedPlan(input.planId, api, async (planId) => {
      const [accountsResponse, monthsResponse] = await Promise.all([
        api.accounts.getAccounts(planId),
        api.months.getPlanMonths(planId),
      ]);

      const liquidCash = liquidCashMilliunits(accountsResponse.data.accounts);
      const months = recentMonths(monthsResponse.data.months, input.asOfMonth, monthsBack);
      const averageDailyOutflow = averageDailyOutflowMilliunits(months);
      const noOutflows = averageDailyOutflow === 0;
      const runwayDays = noOutflows ? null : liquidCash / averageDailyOutflow;
      const status = noOutflows ? "no_outflows" : runwayDays! >= 90 ? "stable" : runwayDays! >= 30 ? "watch" : "urgent";

      return toTextResult(compactObject({
        as_of_month: input.asOfMonth,
        liquid_cash: formatAmount(liquidCash),
        average_daily_outflow: formatAmount(averageDailyOutflow),
        runway_days: runwayDays !== null ? runwayDays.toFixed(2) : undefined,
        status,
        months_considered: months.length,
      }));
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
