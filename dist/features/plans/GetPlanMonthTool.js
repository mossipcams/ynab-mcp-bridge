import { z } from "zod";
import { getCachedPlanMonth } from "../../tools/cachedYnabReads.js";
import { compactObject } from "../../tools/financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "../../runtimePlanToolUtils.js";
export const name = "ynab_get_plan_month";
export const description = "Gets a single plan month snapshot. Returns a compact summary by default, with an explicit full-view opt-in.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    month: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("The month in ISO format or the string 'current'."),
    view: z.enum(["compact", "full"]).default("compact").optional().describe("Returns a compact projection by default, or the full month payload when set to 'full'."),
};
export async function execute(input, api) {
    try {
        const month = input.month || "current";
        const response = await withResolvedPlan(input.planId, api, async (planId) => getCachedPlanMonth(api, planId, month));
        const monthDetail = response.data.month;
        if (input.view === "full") {
            return toTextResult({
                month: monthDetail,
            });
        }
        return toTextResult({
            month: compactObject({
                month: monthDetail.month,
                income: monthDetail.income,
                budgeted: monthDetail.budgeted,
                activity: monthDetail.activity,
                to_be_budgeted: monthDetail.to_be_budgeted,
                age_of_money: monthDetail.age_of_money,
                category_count: Array.isArray(monthDetail.categories) ? monthDetail.categories.length : undefined,
            }),
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
