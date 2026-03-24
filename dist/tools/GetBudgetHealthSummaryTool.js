import { z } from "zod";
import { buildAssignedSpentSummary, compactObject, formatMilliunits, toSpentMilliunits } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_budget_health_summary";
export const description = "Returns a compact budget health summary with available funds, overspending, underfunding, and assigned versus spent. `assigned_vs_spent` reflects budget timing and buffering, not a discipline score.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    month: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("The month in ISO format or the string 'current'."),
    topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of category rollups to include."),
};
function sortDescendingByAmount(entries) {
    return entries
        .slice()
        .sort((left, right) => {
        const difference = right.amountMilliunits - left.amountMilliunits;
        if (difference !== 0) {
            return difference;
        }
        return left.name.localeCompare(right.name);
    });
}
export async function execute(input, api) {
    try {
        const month = input.month || "current";
        const topN = input.topN ?? 5;
        return await withResolvedPlan(input.planId, api, async (planId) => {
            const response = await api.months.getPlanMonth(planId, month);
            const monthDetail = response.data.month;
            const categories = monthDetail.categories.filter((category) => !category.deleted && !category.hidden);
            const overspentCategories = sortDescendingByAmount(categories
                .filter((category) => category.balance < 0)
                .map((category) => ({
                id: category.id,
                name: category.name,
                categoryGroupName: category.category_group_name,
                amountMilliunits: Math.abs(category.balance),
            })));
            const underfundedCategories = sortDescendingByAmount(categories
                .filter((category) => (category.goal_under_funded ?? 0) > 0)
                .map((category) => ({
                id: category.id,
                name: category.name,
                categoryGroupName: category.category_group_name,
                amountMilliunits: category.goal_under_funded ?? 0,
            })));
            return toTextResult({
                month: monthDetail.month,
                ready_to_assign: formatMilliunits(monthDetail.to_be_budgeted),
                available_total: formatMilliunits(categories
                    .filter((category) => category.balance > 0)
                    .reduce((sum, category) => sum + category.balance, 0)),
                overspent_total: formatMilliunits(overspentCategories.reduce((sum, category) => sum + category.amountMilliunits, 0)),
                underfunded_total: formatMilliunits(underfundedCategories.reduce((sum, category) => sum + category.amountMilliunits, 0)),
                age_of_money: monthDetail.age_of_money,
                ...buildAssignedSpentSummary(monthDetail.budgeted, toSpentMilliunits(monthDetail.activity)),
                overspent_category_count: overspentCategories.length,
                underfunded_category_count: underfundedCategories.length,
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
    }
    catch (error) {
        return toErrorResult(error);
    }
}
