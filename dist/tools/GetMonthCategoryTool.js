import { z } from "zod";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_month_category";
export const description = "Gets a single category for a specific month.";
export const inputSchema = {
    planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
    month: z.string().describe("Month as YYYY-MM-DD."),
    categoryId: z.string().describe("The category ID to fetch."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.categories.getMonthCategoryById(planId, input.month, input.categoryId));
        return toTextResult({
            category: response.data.category,
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
