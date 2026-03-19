import { z } from "zod";
import { averageMonthlySpendingMilliunits, formatAmount, liquidCashMilliunits, recentMonths, } from "./financialDiagnosticsUtils.js";
import { compactObject } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_emergency_fund_coverage";
export const description = "Estimates how many months of recent spending your liquid cash can cover.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    asOfMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("The month to anchor coverage calculations."),
    monthsBack: z.number().int().min(1).max(12).default(3).describe("How many trailing months to average."),
};
export async function execute(input, api) {
    try {
        const monthsBack = input.monthsBack ?? 3;
        return await withResolvedPlan(input.planId, api, async (planId) => {
            const [accountsResponse, monthsResponse] = await Promise.all([
                api.accounts.getAccounts(planId),
                api.months.getPlanMonths(planId),
            ]);
            const liquidCash = liquidCashMilliunits(accountsResponse.data.accounts);
            const months = recentMonths(monthsResponse.data.months, input.asOfMonth, monthsBack);
            const averageMonthlySpending = averageMonthlySpendingMilliunits(months);
            const noSpending = averageMonthlySpending === 0;
            const coverageMonths = noSpending ? null : liquidCash / averageMonthlySpending;
            const status = noSpending ? "no_spending" : coverageMonths >= 6 ? "strong" : coverageMonths >= 3 ? "solid" : coverageMonths >= 1 ? "thin" : "critical";
            return toTextResult(compactObject({
                as_of_month: input.asOfMonth,
                liquid_cash: formatAmount(liquidCash),
                average_monthly_spending: formatAmount(averageMonthlySpending),
                coverage_months: coverageMonths !== null ? coverageMonths.toFixed(2) : undefined,
                status,
                months_considered: months.length,
            }));
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
