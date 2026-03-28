import { z } from "zod";
import * as ynab from "ynab";

import { getCachedPlanMonth } from "./cachedYnabReads.js";
import { buildBudgetHealthMonthSummary, compactObject, formatMilliunits } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./runtimePlanToolUtils.js";

export const name = "ynab_get_budget_health_summary";
export const description =
  "Returns a compact budget health summary with available funds, overspending, underfunding, and assigned versus spent. `assigned_vs_spent` reflects budget timing and buffering, not a discipline score.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  month: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe(
    "The month in ISO format or the string 'current'.",
  ),
  topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of category rollups to include."),
};

export async function execute(
  input: { planId?: string; month?: string; topN?: number },
  api: ynab.API,
) {
  try {
    const month = input.month || "current";
    const topN = input.topN ?? 5;

    return await withResolvedPlan(input.planId, api, async (planId) => {
      const response = await getCachedPlanMonth(api, planId, month);
      const monthDetail = response.data.month;
      const {
        overspent_categories: overspentCategories,
        underfunded_categories: underfundedCategories,
        ...budgetHealthSummary
      } = buildBudgetHealthMonthSummary(monthDetail);

      return toTextResult({
        month: monthDetail.month,
        age_of_money: monthDetail.age_of_money,
        ...budgetHealthSummary,
        top_overspent_categories: overspentCategories.slice(0, topN).map((category) => compactObject({
          id: category.id,
          name: category.name,
          category_group_name: category.categoryGroupName,
          amount: formatMilliunits(category.amountMilliunits),
        })),
        top_underfunded_categories: underfundedCategories.slice(0, topN).map((category) => compactObject({
          id: category.id,
          name: category.name,
          category_group_name: category.categoryGroupName,
          amount: formatMilliunits(category.amountMilliunits),
        })),
      });
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
