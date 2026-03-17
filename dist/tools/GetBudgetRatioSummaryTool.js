import { z } from "zod";
import { buildAllocationBreakdown, formatMilliunits, toSpentMilliunits, toTopRollups } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_70_20_10_summary";
export const description = "Returns a compact 70/20/10-style income allocation summary across needs, wants, and savings or debt.";
export const inputSchema = {
    planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
    month: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("Month as YYYY-MM-DD or 'current'."),
    needsGroupNames: z.array(z.string()).default([]).describe("Category group names that count as needs."),
    wantsGroupNames: z.array(z.string()).default([]).describe("Category group names that count as wants."),
    savingsDebtGroupNames: z.array(z.string()).default([]).describe("Category group names that count as savings or debt."),
    topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of categories to include per bucket."),
};
function inGroupList(name, allowedNames) {
    return !!name && allowedNames.includes(name);
}
export async function execute(input, api) {
    try {
        const month = input.month || "current";
        const topN = input.topN ?? 5;
        const needsGroupNames = input.needsGroupNames ?? [];
        const wantsGroupNames = input.wantsGroupNames ?? [];
        const savingsDebtGroupNames = input.savingsDebtGroupNames ?? [];
        return await withResolvedPlan(input.planId, api, async (planId) => {
            const response = await api.months.getPlanMonth(planId, month);
            const categories = response.data.month.categories.filter((category) => !category.deleted && !category.hidden);
            const bucketDefinitions = {
                needs: {
                    groupNames: needsGroupNames,
                    amount: (category) => toSpentMilliunits(category.activity),
                    targetPercent: 70,
                },
                wants: {
                    groupNames: wantsGroupNames,
                    amount: (category) => toSpentMilliunits(category.activity),
                    targetPercent: 20,
                },
                savings_debt: {
                    groupNames: savingsDebtGroupNames,
                    amount: (category) => category.budgeted,
                    targetPercent: 10,
                },
            };
            const incomeMilliunits = response.data.month.income;
            const buckets = Object.fromEntries(Object.entries(bucketDefinitions).map(([bucketName, definition]) => {
                const bucketCategories = categories.filter((category) => inGroupList(category.category_group_name, definition.groupNames));
                const amountMilliunits = bucketCategories.reduce((sum, category) => sum + definition.amount(category), 0);
                return [
                    bucketName,
                    buildAllocationBreakdown(amountMilliunits, incomeMilliunits, definition.targetPercent),
                ];
            }));
            const topCategories = Object.fromEntries(Object.entries(bucketDefinitions).map(([bucketName, definition]) => {
                const bucketCategories = categories.filter((category) => inGroupList(category.category_group_name, definition.groupNames));
                return [
                    bucketName,
                    toTopRollups(bucketCategories.map((category) => ({
                        id: category.id,
                        name: category.name,
                        amountMilliunits: definition.amount(category),
                    })), topN),
                ];
            }));
            return toTextResult({
                month: response.data.month.month,
                income: formatMilliunits(incomeMilliunits),
                buckets,
                top_categories: topCategories,
            });
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
