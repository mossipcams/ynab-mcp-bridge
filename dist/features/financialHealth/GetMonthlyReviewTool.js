import { z } from "zod";
import { previousMonths } from "./financialDiagnosticsUtils.js";
import { buildBudgetHealthMonthSummary, buildCategorySpentLookup, buildSpendingAnomalies, formatMilliunits, isWithinMonthRange, normalizeMonthInput, toTopRollups, } from "../../financeToolUtils.js";
import { getCachedPlanMonth } from "../../cachedYnabReads.js";
import { toErrorResult, toProseResult, toTextResult, withResolvedPlan } from "../../runtimePlanToolUtils.js";
import { buildProse, proseItem, proseRecordItem } from "./proseFormatUtils.js";
export const name = "ynab_get_monthly_review";
export const description = "Monthly review with income, cash flow, budget health, top spending, and notable changes.";
export const inputSchema = {
    planId: z.string().optional().describe("Plan ID (uses env default)"),
    month: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("Month (ISO or 'current')"),
    baselineMonths: z.number().int().min(1).max(12).default(3).describe("Baseline months"),
    topN: z.number().int().min(1).max(10).default(5).describe("Top N results"),
    format: z.enum(["compact", "pretty", "prose"]).default("compact").describe("Output format."),
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
        const format = input.format ?? "compact";
        return await withResolvedPlan(input.planId, api, async (planId) => {
            const baselineMonthIds = previousMonths(month, baselineMonths);
            const [transactionsResponse, baselineResponses, currentMonthResponse] = await Promise.all([
                api.transactions.getTransactions(planId, month, undefined, undefined),
                Promise.all(baselineMonthIds.map((baselineMonth) => getCachedPlanMonth(api, planId, baselineMonth))),
                getCachedPlanMonth(api, planId, month),
            ]);
            if (!currentMonthResponse) {
                throw new Error("Month review requires a current month response.");
            }
            const monthDetail = currentMonthResponse.data.month;
            const categories = monthDetail.categories.filter((category) => !category.deleted && !category.hidden);
            const baselineSpentLookups = buildCategorySpentLookup(baselineResponses);
            const budgetHealthDetails = buildBudgetHealthMonthSummary(monthDetail);
            const budgetHealthSummary = {
                ready_to_assign: budgetHealthDetails.ready_to_assign,
                available_total: budgetHealthDetails.available_total,
                overspent_total: budgetHealthDetails.overspent_total,
                underfunded_total: budgetHealthDetails.underfunded_total,
                assigned: budgetHealthDetails.assigned,
                spent: budgetHealthDetails.spent,
                assigned_vs_spent: budgetHealthDetails.assigned_vs_spent,
                overspent_category_count: budgetHealthDetails.overspent_category_count,
                underfunded_category_count: budgetHealthDetails.underfunded_category_count,
            };
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
            const anomalies = buildSpendingAnomalies({
                baselineSpentLookups,
                categories,
                formatAmount: formatMilliunits,
                formatPercent: (value) => value.toFixed(2),
                minimumDifference: 10_000,
                thresholdMultiplier: 2,
                topN,
            });
            const payload = {
                month: monthDetail.month,
                income: formatMilliunits(monthDetail.income),
                inflow: formatMilliunits(inflowMilliunits),
                outflow: formatMilliunits(outflowMilliunits),
                net_flow: formatMilliunits(inflowMilliunits - outflowMilliunits),
                ...budgetHealthSummary,
                top_spending_categories: toTopRollups(Array.from(spendingRollups.values()), topN),
                anomalies,
            };
            if (format === "prose") {
                return toProseResult(buildProse(`Monthly Review (${payload.month})`, [
                    ["income", payload.income],
                    ["inflow", payload.inflow],
                    ["outflow", payload.outflow],
                    ["net_flow", payload.net_flow],
                    ["ready_to_assign", payload.ready_to_assign],
                ], [
                    { heading: "Top Spending", items: payload.top_spending_categories.map((entry) => proseRecordItem(entry, "name", "amount")) },
                    { heading: "Anomalies", items: payload.anomalies.map((entry) => proseItem(entry.category_name, entry.latest_spent, "vs", entry.baseline_average)) },
                ]));
            }
            return toTextResult(payload, format);
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
