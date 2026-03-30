import { z } from "zod";
import { buildCleanupTransactionSummary, compactObject, formatMilliunits, isWithinMonthRange, normalizeMonthInput, } from "./financeToolUtils.js";
import { getCachedPlanMonth } from "./cachedYnabReads.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "../runtimePlanToolUtils.js";
export const name = "ynab_get_budget_cleanup_summary";
export const description = "Returns a compact cleanup punch-list for uncategorized, unapproved, uncleared, and overspent items.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    month: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("The month in ISO format or the string 'current'."),
    topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of example items to include."),
};
export async function execute(input, api) {
    try {
        const month = normalizeMonthInput(input.month);
        const topN = input.topN ?? 5;
        return await withResolvedPlan(input.planId, api, async (planId) => {
            const [transactionsResponse, monthResponse] = await Promise.all([
                api.transactions.getTransactions(planId, month, undefined, undefined),
                getCachedPlanMonth(api, planId, month),
            ]);
            const transactions = transactionsResponse.data.transactions.filter((transaction) => !transaction.deleted && isWithinMonthRange(transaction.date, month, month));
            const { uncategorizedTransactions, unapprovedTransactions, unclearedTransactions, } = buildCleanupTransactionSummary(transactions);
            const overspentCategories = monthResponse.data.month.categories
                .filter((category) => !category.deleted && category.balance < 0)
                .sort((left, right) => left.balance - right.balance);
            const hiddenProblemCategories = monthResponse.data.month.categories.filter((category) => !category.deleted && category.hidden && (category.balance < 0 || (category.goal_under_funded ?? 0) > 0));
            return toTextResult({
                month: monthResponse.data.month.month,
                uncategorized_transaction_count: uncategorizedTransactions.length,
                unapproved_transaction_count: unapprovedTransactions.length,
                uncleared_transaction_count: unclearedTransactions.length,
                overspent_category_count: overspentCategories.length,
                hidden_problem_category_count: hiddenProblemCategories.length,
                top_uncategorized_transactions: uncategorizedTransactions.slice(0, topN).map((transaction) => compactObject({
                    id: transaction.id,
                    date: transaction.date,
                    payee_name: transaction.payee_name ?? undefined,
                    account_name: transaction.account_name,
                    amount: formatMilliunits(Math.abs(transaction.amount)),
                })),
                top_unapproved_transactions: unapprovedTransactions.slice(0, topN).map((transaction) => compactObject({
                    id: transaction.id,
                    date: transaction.date,
                    payee_name: transaction.payee_name ?? undefined,
                    amount: formatMilliunits(Math.abs(transaction.amount)),
                })),
                top_overspent_categories: overspentCategories.slice(0, topN).map((category) => ({
                    id: category.id,
                    name: category.name,
                    amount: formatMilliunits(Math.abs(category.balance)),
                })),
            });
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
