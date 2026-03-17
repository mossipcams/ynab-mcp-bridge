import { z } from "zod";
import { buildCompactListPayload, normalizeListLimit, toErrorResult, toTextResult, withResolvedPlan, } from "./planToolUtils.js";
export const name = "ynab_list_categories";
export const description = "Lists category groups and categories for a single YNAB plan.";
export const inputSchema = {
    planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
    limit: z.number().int().min(1).max(200).optional().describe("Max category groups to return."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.categories.getCategories(planId));
        const categoryGroups = response.data.category_groups
            .filter((group) => !group.deleted && !group.hidden)
            .map((group) => ({
            id: group.id,
            name: group.name,
            categories: group.categories
                .filter((category) => !category.deleted && !category.hidden)
                .map((category) => ({
                id: category.id,
                name: category.name,
            })),
        }));
        return toTextResult(buildCompactListPayload("category_groups", categoryGroups, normalizeListLimit(input.limit)));
    }
    catch (error) {
        return toErrorResult(error);
    }
}
