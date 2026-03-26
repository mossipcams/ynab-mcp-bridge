import { z } from "zod";
import { buildAssignedSpentSummary, formatMilliunits, isWithinMonthRange, normalizeMonthRange, toSpentMilliunits, } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_cash_flow_summary";
export const description = "Returns a compact cash flow summary with inflow, outflow, net flow, and monthly assigned versus spent trends.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    fromMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("The first month in ISO format or the string 'current'."),
    toMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).optional().describe("The last month in ISO format. Defaults to fromMonth."),
};
function toMonthKey(date) {
    return `${date.slice(0, 7)}-01`;
}
export async function execute(input, api) {
    try {
        const { fromMonth, toMonth } = normalizeMonthRange(input.fromMonth, input.toMonth);
        return await withResolvedPlan(input.planId, api, async (planId) => {
            const [transactionsResponse, monthsResponse] = await Promise.all([
                api.transactions.getTransactions(planId, fromMonth, undefined, undefined),
                api.months.getPlanMonths(planId),
            ]);
            const months = monthsResponse.data.months
                .filter((month) => !month.deleted && month.month >= fromMonth && month.month <= toMonth)
                .sort((left, right) => left.month.localeCompare(right.month));
            const periodFlow = new Map(months.map((month) => [month.month, { inflow: 0, outflow: 0 }]));
            for (const transaction of transactionsResponse.data.transactions) {
                if (transaction.deleted || transaction.transfer_account_id || !isWithinMonthRange(transaction.date, fromMonth, toMonth)) {
                    continue;
                }
                const monthKey = toMonthKey(transaction.date);
                const flow = periodFlow.get(monthKey) ?? { inflow: 0, outflow: 0 };
                if (transaction.amount >= 0) {
                    flow.inflow += transaction.amount;
                }
                else {
                    flow.outflow += Math.abs(transaction.amount);
                }
                periodFlow.set(monthKey, flow);
            }
            const inflowMilliunits = Array.from(periodFlow.values()).reduce((sum, period) => sum + period.inflow, 0);
            const outflowMilliunits = Array.from(periodFlow.values()).reduce((sum, period) => sum + period.outflow, 0);
            const assignedMilliunits = months.reduce((sum, month) => sum + month.budgeted, 0);
            const spentMilliunits = months.reduce((sum, month) => sum + toSpentMilliunits(month.activity), 0);
            return toTextResult({
                from_month: fromMonth,
                to_month: toMonth,
                inflow: formatMilliunits(inflowMilliunits),
                outflow: formatMilliunits(outflowMilliunits),
                net_flow: formatMilliunits(inflowMilliunits - outflowMilliunits),
                ...buildAssignedSpentSummary(assignedMilliunits, spentMilliunits),
                periods: months.map((month) => {
                    const flow = periodFlow.get(month.month) ?? { inflow: 0, outflow: 0 };
                    return {
                        month: month.month,
                        inflow: formatMilliunits(flow.inflow),
                        outflow: formatMilliunits(flow.outflow),
                        net_flow: formatMilliunits(flow.inflow - flow.outflow),
                        ...buildAssignedSpentSummary(month.budgeted, toSpentMilliunits(month.activity)),
                    };
                }),
            });
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
