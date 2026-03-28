import { z } from "zod";
import { buildUpcomingWindowSummary, expandScheduledOccurrences, formatMilliunits } from "./financeToolUtils.js";
import { getCachedScheduledTransactions } from "./cachedYnabReads.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./runtimePlanToolUtils.js";
export const name = "ynab_get_upcoming_obligations";
export const description = "Returns compact 7, 14, and 30 day windows for due outflows and expected inflows from scheduled transactions, excluding transfers.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("The anchor date in ISO format."),
    topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of due items to include."),
};
const WINDOW_DAYS = [7, 14, 30];
function getTodayIsoDate() {
    return new Date().toISOString().slice(0, 10);
}
export async function execute(input, api) {
    try {
        const asOfDate = input.asOfDate ?? getTodayIsoDate();
        const topN = input.topN ?? 5;
        return await withResolvedPlan(input.planId, api, async (planId) => {
            const response = await getCachedScheduledTransactions(api, planId);
            const scheduledTransactions = expandScheduledOccurrences(response.data.scheduled_transactions.filter((transaction) => !transaction.deleted), asOfDate, 30)
                .sort((left, right) => {
                const dayDifference = left.days_until_due - right.days_until_due;
                if (dayDifference !== 0) {
                    return dayDifference;
                }
                return Math.abs(right.amount) - Math.abs(left.amount);
            });
            const windows = Object.fromEntries(WINDOW_DAYS.map((windowDays) => {
                const windowTransactions = scheduledTransactions.filter((transaction) => transaction.days_until_due <= windowDays);
                const inflows = windowTransactions
                    .filter((transaction) => transaction.amount > 0)
                    .reduce((sum, transaction) => sum + transaction.amount, 0);
                const outflows = windowTransactions
                    .filter((transaction) => transaction.amount < 0)
                    .reduce((sum, transaction) => sum + transaction.amount, 0);
                const outflowCount = windowTransactions.filter((transaction) => transaction.amount < 0).length;
                const inflowCount = windowTransactions.filter((transaction) => transaction.amount > 0).length;
                return [
                    `${windowDays}d`,
                    {
                        ...buildUpcomingWindowSummary(inflows, outflows),
                        obligation_count: outflowCount,
                        expected_inflow_count: inflowCount,
                    },
                ];
            }));
            return toTextResult({
                as_of_date: asOfDate,
                obligation_count: scheduledTransactions.filter((transaction) => transaction.amount < 0).length,
                expected_inflow_count: scheduledTransactions.filter((transaction) => transaction.amount > 0).length,
                windows,
                top_due: scheduledTransactions.slice(0, topN).map((transaction) => ({
                    id: transaction.id,
                    date_next: transaction.occurrence_date,
                    payee_name: transaction.payee_name,
                    category_name: transaction.category_name,
                    account_name: transaction.account_name,
                    amount: formatMilliunits(Math.abs(transaction.amount)),
                    type: transaction.amount >= 0 ? "inflow" : "outflow",
                })),
            });
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
