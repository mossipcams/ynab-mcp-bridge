import { z } from "zod";
import { formatMilliunits, listMonthsInRange, normalizeMonthRange, toSpentMilliunits, } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_category_trend_summary";
export const description = "Returns a compact assigned, spent, and available trend for a category or category group across months.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    fromMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("The first month in ISO format or the string 'current'."),
    toMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).optional().describe("The last month in ISO format. Defaults to fromMonth."),
    categoryId: z.string().optional().describe("Optional category id to summarize."),
    categoryGroupName: z.string().optional().describe("Optional category group name to summarize."),
};
export async function execute(input, api) {
    try {
        const { fromMonth, toMonth } = normalizeMonthRange(input.fromMonth, input.toMonth);
        if (!input.categoryId && !input.categoryGroupName) {
            throw new Error("Provide either categoryId or categoryGroupName.");
        }
        return await withResolvedPlan(input.planId, api, async (planId) => {
            const months = await Promise.all(listMonthsInRange(fromMonth, toMonth).map((month) => api.months.getPlanMonth(planId, month)));
            const periods = months.map((response) => {
                const matchingCategories = response.data.month.categories.filter((category) => {
                    if (category.deleted || category.hidden) {
                        return false;
                    }
                    if (input.categoryId) {
                        return category.id === input.categoryId;
                    }
                    return category.category_group_name === input.categoryGroupName;
                });
                const assignedMilliunits = matchingCategories.reduce((sum, category) => sum + category.budgeted, 0);
                const spentMilliunits = matchingCategories.reduce((sum, category) => sum + toSpentMilliunits(category.activity), 0);
                const availableMilliunits = matchingCategories.reduce((sum, category) => sum + category.balance, 0);
                return {
                    month: response.data.month.month,
                    assignedMilliunits,
                    spentMilliunits,
                    availableMilliunits,
                };
            });
            const totalSpentMilliunits = periods.reduce((sum, period) => sum + period.spentMilliunits, 0);
            const peakPeriod = periods.reduce((peak, period) => (!peak || period.spentMilliunits > peak.spentMilliunits ? period : peak), periods[0]);
            return toTextResult({
                from_month: fromMonth,
                to_month: toMonth,
                scope: input.categoryId
                    ? { type: "category", id: input.categoryId }
                    : { type: "category_group", name: input.categoryGroupName },
                average_spent: formatMilliunits(Math.round(totalSpentMilliunits / Math.max(periods.length, 1))),
                peak_month: peakPeriod?.month,
                spent_change: formatMilliunits((periods[periods.length - 1]?.spentMilliunits ?? 0) - (periods[0]?.spentMilliunits ?? 0)),
                periods: periods.map((period) => ({
                    month: period.month,
                    assigned: formatMilliunits(period.assignedMilliunits),
                    spent: formatMilliunits(period.spentMilliunits),
                    available: formatMilliunits(period.availableMilliunits),
                })),
            });
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
