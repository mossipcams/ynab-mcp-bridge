import { z } from "zod";
import { previousMonths } from "./financialDiagnosticsUtils.js";
import { buildAssignedSpentSummary, formatMilliunits, isWithinMonthRange, normalizeMonthInput, toSpentMilliunits, toTopRollups, } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_monthly_review";
export const description = "Returns a compact monthly review with income, cash flow, budget health, top spending, and notable spending changes, including assigned versus spent as a buffering and timing signal rather than a discipline score.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    month: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("The month in ISO format or the string 'current'."),
    baselineMonths: z.number().int().min(1).max(12).default(3).describe("How many trailing months to use when checking for notable spending changes."),
    topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of rollups or anomalies to include."),
};
function addRollup(bucket, key, value) {
    const current = bucket.get(key);
    if (current) {
        current.amountMilliunits += value.amountMilliunits;
        current.transactionCount += 1;
        return;
    }
    bucket.set(key, {
        id: value.id,
        name: value.name,
        amountMilliunits: value.amountMilliunits,
        transactionCount: 1,
    });
}
export async function execute(input, api) {
    try {
        const month = normalizeMonthInput(input.month);
        const baselineMonths = input.baselineMonths ?? 3;
        const topN = input.topN ?? 5;
        return await withResolvedPlan(input.planId, api, async (planId) => {
            const baselineMonthIds = previousMonths(month, baselineMonths);
            const [transactionsResponse, baselineResponses, currentMonthResponse] = await Promise.all([
                api.transactions.getTransactions(planId, month, undefined, undefined),
                Promise.all(baselineMonthIds.map((baselineMonth) => api.months.getPlanMonth(planId, baselineMonth))),
                api.months.getPlanMonth(planId, month),
            ]);
            if (!currentMonthResponse) {
                throw new Error("Month review requires a current month response.");
            }
            const monthDetail = currentMonthResponse.data.month;
            const categories = monthDetail.categories.filter((category) => !category.deleted && !category.hidden);
            const monthTransactions = transactionsResponse.data.transactions.filter((transaction) => !transaction.deleted
                && !transaction.transfer_account_id
                && isWithinMonthRange(transaction.date, month, month));
            const inflowMilliunits = monthTransactions
                .filter((transaction) => transaction.amount > 0)
                .reduce((sum, transaction) => sum + transaction.amount, 0);
            const outflowMilliunits = monthTransactions
                .filter((transaction) => transaction.amount < 0)
                .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
            const spendingRollups = new Map();
            for (const transaction of monthTransactions.filter((entry) => entry.amount < 0)) {
                const categoryId = transaction.category_id ?? "uncategorized";
                addRollup(spendingRollups, categoryId, {
                    id: transaction.category_id ?? undefined,
                    name: transaction.category_name ?? "Uncategorized",
                    amountMilliunits: Math.abs(transaction.amount),
                });
            }
            const overspentCategories = categories.filter((category) => category.balance < 0);
            const underfundedCategories = categories.filter((category) => (category.goal_under_funded ?? 0) > 0);
            const anomalies = categories
                .map((category) => {
                const latestSpent = toSpentMilliunits(category.activity);
                const baselineValues = baselineResponses.map((response) => {
                    const baselineCategory = response.data.month.categories.find((candidate) => candidate.id === category.id);
                    return baselineCategory ? toSpentMilliunits(baselineCategory.activity) : 0;
                });
                const baselineAverage = baselineValues.length === 0
                    ? 0
                    : baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length;
                if (baselineAverage <= 0
                    || latestSpent < baselineAverage * 2
                    || latestSpent - baselineAverage < 10_000) {
                    return undefined;
                }
                return {
                    category_id: category.id,
                    category_name: category.name,
                    latest_spent: formatMilliunits(latestSpent),
                    baseline_average: formatMilliunits(Math.round(baselineAverage)),
                    change_percent: (((latestSpent - baselineAverage) / baselineAverage) * 100).toFixed(2),
                    sort_difference: latestSpent - baselineAverage,
                };
            })
                .filter((anomaly) => !!anomaly)
                .sort((left, right) => right.sort_difference - left.sort_difference)
                .slice(0, topN)
                .map(({ sort_difference: _sortDifference, ...anomaly }) => anomaly);
            return toTextResult({
                month: monthDetail.month,
                income: formatMilliunits(monthDetail.income),
                inflow: formatMilliunits(inflowMilliunits),
                outflow: formatMilliunits(outflowMilliunits),
                net_flow: formatMilliunits(inflowMilliunits - outflowMilliunits),
                ready_to_assign: formatMilliunits(monthDetail.to_be_budgeted),
                available_total: formatMilliunits(categories
                    .filter((category) => category.balance > 0)
                    .reduce((sum, category) => sum + category.balance, 0)),
                overspent_total: formatMilliunits(overspentCategories.reduce((sum, category) => sum + Math.abs(category.balance), 0)),
                underfunded_total: formatMilliunits(underfundedCategories.reduce((sum, category) => sum + (category.goal_under_funded ?? 0), 0)),
                overspent_category_count: overspentCategories.length,
                underfunded_category_count: underfundedCategories.length,
                ...buildAssignedSpentSummary(monthDetail.budgeted, toSpentMilliunits(monthDetail.activity)),
                top_spending_categories: toTopRollups(Array.from(spendingRollups.values()), topN),
                anomalies,
            });
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
