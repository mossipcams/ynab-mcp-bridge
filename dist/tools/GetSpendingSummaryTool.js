import { z } from "zod";
import { buildAssignedSpentSummary, formatMilliunits, toTopRollups } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_spending_summary";
export const description = "Returns a compact spending summary with assigned versus spent totals and top spending rollups.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    fromMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("The first month in ISO format or the string 'current'."),
    toMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).optional().describe("The last month in ISO format. Defaults to fromMonth."),
    topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of top rollups to include."),
};
function toMonthEnd(month) {
    const [yearValue, monthValue] = month.split("-");
    const year = Number.parseInt(yearValue ?? "", 10);
    const monthNumber = Number.parseInt(monthValue ?? "", 10);
    if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) {
        throw new Error(`Invalid month value: ${month}`);
    }
    return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}
function isWithinRange(date, fromMonth, toMonth) {
    return date >= fromMonth && date <= toMonthEnd(toMonth);
}
function buildCategoryGroupLookup(categoryGroups) {
    return new Map(categoryGroups.flatMap((group) => group.categories
        .filter((category) => !category.deleted)
        .map((category) => [category.id, group.name])));
}
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
        const fromMonth = input.fromMonth || "current";
        const toMonth = input.toMonth || fromMonth;
        const topN = input.topN ?? 5;
        return await withResolvedPlan(input.planId, api, async (planId) => {
            const [transactionsResponse, monthsResponse, categoriesResponse] = await Promise.all([
                api.transactions.getTransactions(planId, fromMonth, undefined, undefined),
                api.months.getPlanMonths(planId),
                api.categories.getCategories(planId),
            ]);
            const groupByCategoryId = buildCategoryGroupLookup(categoriesResponse.data.category_groups);
            const categoryRollups = new Map();
            const categoryGroupRollups = new Map();
            const payeeRollups = new Map();
            const spendingTransactions = transactionsResponse.data.transactions.filter((transaction) => !transaction.deleted
                && !transaction.transfer_account_id
                && transaction.amount < 0
                && isWithinRange(transaction.date, fromMonth, toMonth));
            for (const transaction of spendingTransactions) {
                const spendMilliunits = Math.abs(transaction.amount);
                const categoryId = transaction.category_id ?? "uncategorized";
                const categoryName = transaction.category_name ?? "Uncategorized";
                const groupName = groupByCategoryId.get(categoryId) ?? "Uncategorized";
                const payeeId = transaction.payee_id ?? "unknown-payee";
                const payeeName = transaction.payee_name ?? "Unknown Payee";
                addRollup(categoryRollups, categoryId, {
                    id: transaction.category_id ?? undefined,
                    name: categoryName,
                    amountMilliunits: spendMilliunits,
                });
                addRollup(categoryGroupRollups, groupName, {
                    name: groupName,
                    amountMilliunits: spendMilliunits,
                });
                addRollup(payeeRollups, payeeId, {
                    id: transaction.payee_id ?? undefined,
                    name: payeeName,
                    amountMilliunits: spendMilliunits,
                });
            }
            const assignedMilliunits = monthsResponse.data.months
                .filter((month) => !month.deleted && month.month >= fromMonth && month.month <= toMonth)
                .reduce((sum, month) => sum + month.budgeted, 0);
            const spentMilliunits = spendingTransactions.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
            return toTextResult({
                from_month: fromMonth,
                to_month: toMonth,
                ...buildAssignedSpentSummary(assignedMilliunits, spentMilliunits),
                transaction_count: spendingTransactions.length,
                average_transaction: formatMilliunits(spendingTransactions.length > 0 ? Math.round(spentMilliunits / spendingTransactions.length) : 0),
                top_categories: toTopRollups(Array.from(categoryRollups.values()), topN),
                top_category_groups: toTopRollups(Array.from(categoryGroupRollups.values()), topN),
                top_payees: toTopRollups(Array.from(payeeRollups.values()), topN),
            });
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
