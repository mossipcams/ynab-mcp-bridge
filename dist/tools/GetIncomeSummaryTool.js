import { z } from "zod";
import { formatMilliunits, listMonthsInRange, toTopRollups } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_income_summary";
export const description = "Returns a compact monthly income summary with totals, stability metrics, and top income sources.";
export const inputSchema = {
    planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
    fromMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("Start month as YYYY-MM-DD or 'current'."),
    toMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).optional().describe("End month as YYYY-MM-DD. Defaults to fromMonth."),
    topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of income sources to include."),
};
function toMonthEnd(month) {
    const [year, monthNumber] = month.split("-").map((value) => Number.parseInt(value, 10));
    return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}
function toMonthKey(date) {
    return `${date.slice(0, 7)}-01`;
}
export async function execute(input, api) {
    try {
        const fromMonth = input.fromMonth || "current";
        const toMonth = input.toMonth || fromMonth;
        const topN = input.topN ?? 5;
        return await withResolvedPlan(input.planId, api, async (planId) => {
            const response = await api.transactions.getTransactions(planId, fromMonth, undefined, undefined);
            const transactions = response.data.transactions.filter((transaction) => !transaction.deleted
                && !transaction.transfer_account_id
                && transaction.amount > 0
                && transaction.date >= fromMonth
                && transaction.date <= toMonthEnd(toMonth));
            const incomeByMonth = new Map(listMonthsInRange(fromMonth, toMonth).map((month) => [month, 0]));
            const incomeByPayee = new Map();
            for (const transaction of transactions) {
                const month = toMonthKey(transaction.date);
                incomeByMonth.set(month, (incomeByMonth.get(month) ?? 0) + transaction.amount);
                const payeeKey = transaction.payee_id ?? "unknown-payee";
                const current = incomeByPayee.get(payeeKey);
                if (current) {
                    current.amountMilliunits += transaction.amount;
                    current.transactionCount += 1;
                }
                else {
                    incomeByPayee.set(payeeKey, {
                        id: transaction.payee_id ?? undefined,
                        name: transaction.payee_name ?? "Unknown Payee",
                        amountMilliunits: transaction.amount,
                        transactionCount: 1,
                    });
                }
            }
            const monthTotals = Array.from(incomeByMonth.entries()).map(([month, income]) => ({ month, income }));
            const incomeValues = monthTotals.map((entry) => entry.income);
            const incomeTotal = incomeValues.reduce((sum, income) => sum + income, 0);
            const averageIncome = incomeValues.length === 0 ? 0 : incomeTotal / incomeValues.length;
            const sortedIncomeValues = incomeValues.slice().sort((left, right) => left - right);
            const medianIncome = sortedIncomeValues.length === 0
                ? 0
                : sortedIncomeValues.length % 2 === 1
                    ? sortedIncomeValues[(sortedIncomeValues.length - 1) / 2]
                    : (sortedIncomeValues[(sortedIncomeValues.length / 2) - 1] + sortedIncomeValues[sortedIncomeValues.length / 2]) / 2;
            const minIncome = sortedIncomeValues[0] ?? 0;
            const maxIncome = sortedIncomeValues[sortedIncomeValues.length - 1] ?? 0;
            const volatilityPercent = averageIncome === 0 ? 0 : ((maxIncome - minIncome) / averageIncome) * 100;
            return toTextResult({
                from_month: fromMonth,
                to_month: toMonth,
                income_total: formatMilliunits(incomeTotal),
                average_monthly_income: formatMilliunits(Math.round(averageIncome)),
                median_monthly_income: formatMilliunits(Math.round(medianIncome)),
                income_month_count: monthTotals.length,
                volatility_percent: volatilityPercent.toFixed(2),
                top_income_sources: toTopRollups(Array.from(incomeByPayee.values()), topN),
                months: monthTotals.map((entry) => ({
                    month: entry.month,
                    income: formatMilliunits(entry.income),
                })),
            });
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
