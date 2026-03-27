import { z } from "zod";
import { compactRisk, daysUntil, formatAmount, formatPercent, getTodayIsoDate, liquidCashMilliunits, netWorthMilliunits, recentMonths, totalDebtMilliunits, spreadPercent, } from "./financialDiagnosticsUtils.js";
import { getCachedAccounts, getCachedPlanMonth, getCachedPlanMonths, getCachedScheduledTransactions, } from "./cachedYnabReads.js";
import { compactObject, isWithinMonthRange, normalizeMonthInput } from "./financeToolUtils.js";
import { toErrorResult, toProseResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
import { buildProse, proseItem } from "./proseFormatUtils.js";
export const name = "ynab_get_financial_health_check";
export const description = "Compact health check across cash, debt, budget stress, cleanup, and near-term obligations.";
export const inputSchema = {
    planId: z.string().optional().describe("Plan ID (uses env default)"),
    month: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("Month (ISO or 'current')"),
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Anchor date (ISO)"),
    topN: z.number().int().min(1).max(10).default(5).describe("Top N results"),
    format: z.enum(["compact", "pretty", "prose"]).default("compact").describe("Output format."),
};
function risk(code, severity, penalty) {
    return { code, severity, penalty };
}
function sortDescendingByAmount(entries) {
    return entries
        .slice()
        .sort((left, right) => {
        const difference = right.amountMilliunits - left.amountMilliunits;
        if (difference !== 0) {
            return difference;
        }
        return left.name.localeCompare(right.name);
    });
}
export async function execute(input, api) {
    try {
        const month = normalizeMonthInput(input.month);
        const asOfDate = input.asOfDate ?? getTodayIsoDate();
        const topN = input.topN ?? 5;
        const format = input.format ?? "compact";
        return await withResolvedPlan(input.planId, api, async (planId) => {
            const [accountsResponse, monthResponse, monthsResponse, transactionsResponse, scheduledResponse] = await Promise.all([
                getCachedAccounts(api, planId),
                getCachedPlanMonth(api, planId, month),
                getCachedPlanMonths(api, planId),
                api.transactions.getTransactions(planId, month, undefined, undefined),
                getCachedScheduledTransactions(api, planId),
            ]);
            const accounts = accountsResponse.data.accounts;
            const monthDetail = monthResponse.data.month;
            const monthKey = monthDetail.month;
            const liquidCash = liquidCashMilliunits(accounts);
            const debt = totalDebtMilliunits(accounts);
            const netWorth = netWorthMilliunits(accounts);
            const overspentCategories = monthDetail.categories.filter((category) => !category.deleted && !category.hidden && category.balance < 0);
            const underfundedCategories = monthDetail.categories.filter((category) => !category.deleted && !category.hidden && (category.goal_under_funded ?? 0) > 0);
            const transactions = transactionsResponse.data.transactions.filter((transaction) => !transaction.deleted
                && (typeof transaction.date !== "string" || isWithinMonthRange(transaction.date, monthKey, monthKey)));
            const uncategorizedTransactionCount = transactions.filter((transaction) => !transaction.category_id).length;
            const unapprovedTransactionCount = transactions.filter((transaction) => !transaction.approved).length;
            const unclearedTransactionCount = transactions.filter((transaction) => transaction.cleared === "uncleared").length;
            const recentIncomeMonths = recentMonths(monthsResponse.data.months, monthKey, 3);
            const incomeVolatility = spreadPercent(recentIncomeMonths.map((entry) => entry.income ?? 0));
            const upcoming30dNet = scheduledResponse.data.scheduled_transactions
                .filter((transaction) => !transaction.deleted)
                .filter((transaction) => {
                const dueInDays = daysUntil(asOfDate, transaction.date_next);
                return dueInDays >= 0 && dueInDays <= 30;
            })
                .reduce((sum, transaction) => sum + transaction.amount, 0);
            const risks = [];
            if (upcoming30dNet < -liquidCash) {
                risks.push(risk("cash_shortfall", "high", 20));
            }
            if (monthDetail.to_be_budgeted < 0) {
                risks.push(risk("negative_ready_to_assign", "high", 15));
            }
            if (overspentCategories.length > 0) {
                risks.push(risk("overspent_categories", "high", 15));
            }
            if (underfundedCategories.length > 0) {
                risks.push(risk("goal_underfunding", "medium", 10));
            }
            if (uncategorizedTransactionCount + unapprovedTransactionCount + unclearedTransactionCount > 0) {
                risks.push(risk("cleanup_backlog", "medium", 10));
            }
            if ((monthDetail.age_of_money ?? 0) < 14) {
                risks.push(risk("low_age_of_money", "medium", 5));
            }
            if (incomeVolatility > 50) {
                risks.push(risk("income_volatility", "medium", 5));
            }
            const score = Math.max(0, 100 - risks.reduce((sum, entry) => sum + entry.penalty, 0));
            const status = score >= 80 ? "healthy" : score >= 50 ? "watch" : "needs_attention";
            const topOverspent = sortDescendingByAmount(overspentCategories.map((category) => ({
                name: category.name,
                amountMilliunits: Math.abs(category.balance),
            })));
            const topUnderfunded = sortDescendingByAmount(underfundedCategories.map((category) => ({
                name: category.name,
                amountMilliunits: category.goal_under_funded ?? 0,
            })));
            const uncategorizedTransactions = transactions.filter((transaction) => !transaction.category_id);
            const payload = {
                as_of_month: monthKey,
                status,
                score,
                metrics: {
                    net_worth: formatAmount(netWorth),
                    liquid_cash: formatAmount(liquidCash),
                    debt: formatAmount(debt),
                    ready_to_assign: formatAmount(monthDetail.to_be_budgeted),
                    age_of_money: monthDetail.age_of_money,
                    overspent_category_count: overspentCategories.length,
                    underfunded_category_count: underfundedCategories.length,
                    uncategorized_transaction_count: uncategorizedTransactionCount,
                    unapproved_transaction_count: unapprovedTransactionCount,
                    uncleared_transaction_count: unclearedTransactionCount,
                    upcoming_30d_net: formatAmount(upcoming30dNet),
                    income_volatility_percent: formatPercent(incomeVolatility),
                },
                top_risks: risks
                    .slice()
                    .sort((left, right) => right.penalty - left.penalty)
                    .slice(0, topN)
                    .map((entry) => compactRisk(entry.code, entry.severity)),
                top_overspent: topOverspent.slice(0, topN).map((category) => compactObject({
                    name: category.name,
                    amount: formatAmount(category.amountMilliunits),
                })),
                top_underfunded: topUnderfunded.slice(0, topN).map((category) => compactObject({
                    name: category.name,
                    amount: formatAmount(category.amountMilliunits),
                })),
                top_uncategorized: uncategorizedTransactions.slice(0, topN).map((transaction) => compactObject({
                    date: transaction.date,
                    payee_name: transaction.payee_name ?? undefined,
                    amount: formatAmount(Math.abs(transaction.amount)),
                })),
            };
            if (format === "prose") {
                return toProseResult(buildProse(`Financial Health Check (${payload.as_of_month})`, [
                    ["status", payload.status],
                    ["score", payload.score],
                    ["net_worth", payload.metrics.net_worth],
                    ["liquid_cash", payload.metrics.liquid_cash],
                    ["debt", payload.metrics.debt],
                    ["ready_to_assign", payload.metrics.ready_to_assign],
                    ["upcoming_30d_net", payload.metrics.upcoming_30d_net],
                ], [
                    { heading: "Top Risks", items: payload.top_risks.map((riskEntry) => proseItem(riskEntry["code"], riskEntry["severity"])) },
                    { heading: "Overspent", items: payload.top_overspent.map((entry) => proseItem(entry["name"], entry["amount"])) },
                    { heading: "Underfunded", items: payload.top_underfunded.map((entry) => proseItem(entry["name"], entry["amount"])) },
                    { heading: "Uncategorized", items: payload.top_uncategorized.map((entry) => proseItem(entry["date"], entry["payee_name"], entry["amount"])) },
                ]));
            }
            return toTextResult(payload, format);
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
