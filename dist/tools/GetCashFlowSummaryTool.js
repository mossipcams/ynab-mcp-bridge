import { z } from "zod";
import { buildAssignedSpentSummary, formatMilliunits, isWithinMonthRange, normalizeMonthRange, toSpentMilliunits, } from "./financeToolUtils.js";
import { getCachedPlanMonths } from "./cachedYnabReads.js";
import { toErrorResult, toProseResult, toTextResult, withResolvedPlan } from "../runtimePlanToolUtils.js";
import { buildProse, proseItem } from "./proseFormatUtils.js";
export const name = "ynab_get_cash_flow_summary";
export const description = "Cash flow summary with inflow, outflow, net flow, and assigned vs spent.";
export const inputSchema = {
    planId: z.string().optional().describe("Plan ID (uses env default)"),
    fromMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("Start month (ISO or 'current')"),
    toMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).optional().describe("End month (defaults to start)"),
    format: z.enum(["compact", "pretty", "prose"]).default("compact").describe("Output format."),
};
function toMonthKey(date) {
    return `${date.slice(0, 7)}-01`;
}
export async function execute(input, api) {
    try {
        const { fromMonth, toMonth } = normalizeMonthRange(input.fromMonth, input.toMonth);
        const format = input.format ?? "compact";
        return await withResolvedPlan(input.planId, api, async (planId) => {
            const [transactionsResponse, monthsResponse] = await Promise.all([
                api.transactions.getTransactions(planId, fromMonth, undefined, undefined),
                getCachedPlanMonths(api, planId),
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
            const payload = {
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
            };
            if (format === "prose") {
                return toProseResult(buildProse(`Cash Flow Summary (${payload.from_month} to ${payload.to_month})`, [
                    ["inflow", payload.inflow],
                    ["outflow", payload.outflow],
                    ["net_flow", payload.net_flow],
                    ["assigned", payload.assigned],
                    ["spent", payload.spent],
                    ["assigned_vs_spent", payload.assigned_vs_spent],
                ], [
                    { heading: "Periods", items: payload.periods.map((period) => proseItem(period.month, period.net_flow)) },
                ]));
            }
            return toTextResult(payload, format);
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
