import { z } from "zod";
import * as ynab from "ynab";

import { getCachedPlanMonth } from "./cachedYnabReads.js";
import { buildBudgetHealthMonthSummary, compactObject, formatMilliunits } from "./financeToolUtils.js";
import type { OutputFormat } from "./planToolUtils.js";
import { toErrorResult, toProseResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
import { buildProse, proseRecordItem } from "./proseFormatUtils.js";

export const name = "ynab_get_budget_health_summary";
export const description =
  "Budget health summary with funds available, overspending, underfunding, and assigned vs spent.";
export const inputSchema = {
  planId: z.string().optional().describe("Plan ID (uses env default)"),
  month: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("Month (ISO or 'current')"),
  topN: z.number().int().min(1).max(10).default(5).describe("Top N results"),
  format: z.enum(["compact", "pretty", "prose"]).default("compact").describe("Output format."),
};

export async function execute(
  input: { planId?: string; month?: string; topN?: number; format?: OutputFormat },
  api: ynab.API,
) {
  try {
    const month = input.month || "current";
    const topN = input.topN ?? 5;
    const format = input.format ?? "compact";

    return await withResolvedPlan(input.planId, api, async (planId) => {
      const response = await getCachedPlanMonth(api, planId, month);
      const monthDetail = response.data.month;
      const {
        overspent_categories: overspentCategories,
        underfunded_categories: underfundedCategories,
        ...budgetHealthSummary
      } = buildBudgetHealthMonthSummary(monthDetail);

      const payload = {
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
      };

      if (format === "prose") {
        return toProseResult(buildProse(
          `Budget Health (${payload.month})`,
          [
            ["ready_to_assign", payload.ready_to_assign],
            ["available_total", payload.available_total],
            ["overspent_total", payload.overspent_total],
            ["underfunded_total", payload.underfunded_total],
            ["age_of_money", payload.age_of_money],
          ],
          [
            { heading: "Overspent", items: payload.top_overspent_categories.map((entry) => proseRecordItem(entry, "name", "amount")) },
            { heading: "Underfunded", items: payload.top_underfunded_categories.map((entry) => proseRecordItem(entry, "name", "amount")) },
          ],
        ));
      }

      return toTextResult(payload, format);
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
