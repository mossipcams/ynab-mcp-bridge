import { z } from "zod";
import { debtMilliunits, formatMilliunits, liquidCashMilliunits, listMonthsInRange, netWorthMilliunits, normalizeMonthRange, reconstructHistoricalAccountBalances, } from "./financeToolUtils.js";
import { getCachedAccounts } from "./cachedYnabReads.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_net_worth_trajectory";
export const description = "Returns a compact month-by-month net worth trajectory with liquid cash and debt across a month range.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    fromMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("The first month in ISO format or the string 'current'."),
    toMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).optional().describe("The last month in ISO format. Defaults to fromMonth."),
};
function isIncludedAccount(account) {
    return !account.deleted;
}
export async function execute(input, api) {
    try {
        const { fromMonth, toMonth } = normalizeMonthRange(input.fromMonth, input.toMonth);
        return await withResolvedPlan(input.planId, api, async (planId) => {
            const [accountsResponse, transactionsResponse] = await Promise.all([
                getCachedAccounts(api, planId),
                api.transactions.getTransactions(planId, fromMonth, undefined, undefined),
            ]);
            const accounts = accountsResponse.data.accounts.filter(isIncludedAccount);
            const months = listMonthsInRange(fromMonth, toMonth);
            const balancesByMonth = reconstructHistoricalAccountBalances(accounts, transactionsResponse.data.transactions, months);
            const monthSummaries = months.map((month) => {
                const monthAccounts = balancesByMonth.get(month) ?? accounts;
                return {
                    month,
                    net_worth: formatMilliunits(netWorthMilliunits(monthAccounts)),
                    liquid_cash: formatMilliunits(liquidCashMilliunits(monthAccounts)),
                    debt: formatMilliunits(debtMilliunits(monthAccounts)),
                };
            });
            const startNetWorth = monthSummaries[0]?.net_worth ?? formatMilliunits(0);
            const endNetWorth = monthSummaries[monthSummaries.length - 1]?.net_worth ?? formatMilliunits(0);
            return toTextResult({
                from_month: fromMonth,
                to_month: toMonth,
                start_net_worth: startNetWorth,
                end_net_worth: endNetWorth,
                change_net_worth: formatMilliunits(netWorthMilliunits(balancesByMonth.get(toMonth) ?? accounts)
                    - netWorthMilliunits(balancesByMonth.get(fromMonth) ?? accounts)),
                months: monthSummaries,
            });
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
