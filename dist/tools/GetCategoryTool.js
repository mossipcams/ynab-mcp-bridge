import { z } from "zod";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_category";
export const description = "Gets a single category by ID.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    categoryId: z.string().describe("The category ID to fetch."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.categories.getCategoryById(planId, input.categoryId));
        return toTextResult({
            category: response.data.category,
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
