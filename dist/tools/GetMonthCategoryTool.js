import { z } from "zod";
import { compactObject } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_month_category";
export const description = "Gets a single category for a specific month. Returns a compact projection by default, with an explicit full-view opt-in.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    month: z.string().describe("The month in ISO format (YYYY-MM-DD)."),
    categoryId: z.string().describe("The category ID to fetch."),
    view: z.enum(["compact", "full"]).default("compact").optional().describe("Returns a compact projection by default, or the full month category payload when set to 'full'."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.categories.getMonthCategoryById(planId, input.month, input.categoryId));
        const category = response.data.category;
        if (input.view === "full") {
            return toTextResult({
                category,
            });
        }
        return toTextResult({
            category: compactObject({
                id: category.id,
                name: category.name,
                hidden: category.hidden,
                category_group_name: category.category_group_name,
                budgeted: category.budgeted,
                activity: category.activity,
                balance: category.balance,
                goal_type: category.goal_type,
                goal_target: category.goal_target,
                goal_under_funded: category.goal_under_funded,
            }),
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
