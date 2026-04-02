import { z } from "zod";
import * as ynab from "ynab";

import { compactObject, formatMilliunits } from "../../tools/financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "../../runtimePlanToolUtils.js";

export const name = "ynab_get_category";
export const description =
  "Gets a single category by ID. Returns a compact projection by default, with an explicit full-view opt-in.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  categoryId: z.string().describe("The category ID to fetch."),
  view: z.enum(["compact", "full"]).default("compact").optional().describe("Returns a compact projection by default, or the full category payload when set to 'full'."),
};

export async function execute(
  input: { planId?: string; categoryId: string; view?: "compact" | "full" },
  api: ynab.API,
) {
  try {
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.categories.getCategoryById(planId, input.categoryId));
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
        balance: category.balance == null ? undefined : formatMilliunits(category.balance),
        goal_type: category.goal_type,
        goal_target: category.goal_target == null ? undefined : formatMilliunits(category.goal_target),
      }),
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
