import { z } from "zod";
import { getCachedPlanMonth } from "../../cachedYnabReads.js";
import { compactObject, formatMilliunits } from "../../financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "../../runtimePlanToolUtils.js";
export const name = "ynab_get_goal_progress_summary";
export const description = "Returns a compact summary of YNAB goal progress, underfunded goals, and top goal gaps.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    month: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("The month in ISO format or the string 'current'."),
    topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of goal rollups to include."),
};
export async function execute(input, api) {
    try {
        const month = input.month || "current";
        const topN = input.topN ?? 5;
        return await withResolvedPlan(input.planId, api, async (planId) => {
            const response = await getCachedPlanMonth(api, planId, month);
            const goalCategories = response.data.month.categories
                .filter((category) => !category.deleted && !category.hidden && category.goal_type);
            const underfundedGoals = goalCategories
                .filter((category) => (category.goal_under_funded ?? 0) > 0)
                .sort((left, right) => (right.goal_under_funded ?? 0) - (left.goal_under_funded ?? 0));
            return toTextResult({
                month: response.data.month.month,
                goal_count: goalCategories.length,
                underfunded_total: formatMilliunits(underfundedGoals.reduce((sum, category) => sum + (category.goal_under_funded ?? 0), 0)),
                on_track_count: goalCategories.filter((category) => (category.goal_under_funded ?? 0) === 0).length,
                off_track_count: underfundedGoals.length,
                top_underfunded_goals: underfundedGoals.slice(0, topN).map((category) => compactObject({
                    id: category.id,
                    name: category.name,
                    amount: formatMilliunits(category.goal_under_funded ?? 0),
                    goal_target: category.goal_target == null ? undefined : formatMilliunits(category.goal_target),
                    goal_percentage_complete: category.goal_percentage_complete ?? undefined,
                    goal_months_to_budget: category.goal_months_to_budget ?? undefined,
                })),
            });
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
