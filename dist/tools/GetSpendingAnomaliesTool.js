import { z } from "zod";
import { getCachedPlanMonth } from "./cachedYnabReads.js";
import { formatAmount, formatPercent, previousMonths } from "./financialDiagnosticsUtils.js";
import { buildCategorySpentLookup, buildSpendingAnomalies, isCreditCardPaymentCategoryName } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "../runtimePlanToolUtils.js";
export const name = "ynab_get_spending_anomalies";
export const description = "Flags category spending spikes in a month against a trailing monthly baseline.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    latestMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Month to compare against the baseline."),
    baselineMonths: z.number().int().min(1).max(12).default(3).describe("How many trailing months to use as the baseline."),
    topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of anomalies to include."),
    thresholdMultiplier: z.number().min(1).default(1.5).describe("Minimum multiple over the baseline average to flag."),
    minimumDifference: z.number().int().min(0).default(50000).describe("Minimum milliunit increase over baseline to flag."),
};
export async function execute(input, api) {
    try {
        const baselineMonths = input.baselineMonths ?? 3;
        const topN = input.topN ?? 5;
        const thresholdMultiplier = input.thresholdMultiplier ?? 1.5;
        const minimumDifference = input.minimumDifference ?? 50000;
        return await withResolvedPlan(input.planId, api, async (planId) => {
            const baselineMonthIds = previousMonths(input.latestMonth, baselineMonths);
            const responses = await Promise.all([
                ...baselineMonthIds.map((month) => getCachedPlanMonth(api, planId, month)),
                getCachedPlanMonth(api, planId, input.latestMonth),
            ]);
            const baselineResponses = responses.slice(0, baselineMonthIds.length);
            const latestResponse = responses[responses.length - 1];
            const baselineSpentLookups = buildCategorySpentLookup(baselineResponses);
            if (!latestResponse) {
                throw new Error("Latest month response was not returned.");
            }
            const latestCategories = latestResponse.data.month.categories.filter((category) => (!category.deleted
                && !category.hidden
                && !isCreditCardPaymentCategoryName(category.category_group_name)));
            const anomalies = buildSpendingAnomalies({
                baselineSpentLookups,
                categories: latestCategories,
                formatAmount,
                formatPercent,
                minimumDifference,
                thresholdMultiplier,
                topN,
            });
            return toTextResult({
                latest_month: input.latestMonth,
                baseline_month_count: baselineResponses.length,
                anomaly_count: anomalies.length,
                anomalies,
            });
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
