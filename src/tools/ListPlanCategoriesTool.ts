import { z } from "zod";
import * as ynab from "ynab";

import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const name = "ynab_list_categories";
export const description = "Lists category groups and categories for a single YNAB plan.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
};

export async function execute(input: { planId?: string }, api: ynab.API) {
  try {
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.categories.getCategories(planId));

    return toTextResult({
      category_groups: response.data.category_groups
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
        })),
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
