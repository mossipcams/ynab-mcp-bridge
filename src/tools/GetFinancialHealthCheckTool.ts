import { z } from "zod";
import * as ynab from "ynab";

import {
  compactRisk,
  formatAmount,
  formatPercent,
  getTodayIsoDate,
  liquidCashMilliunits,
  netWorthMilliunits,
  recentMonths,
  totalDebtMilliunits,
  spreadPercent,
} from "./financialDiagnosticsUtils.js";
import { isTransferTransaction, isWithinMonthRange, normalizeMonthInput } from "./financeToolUtils.js";
import { expandScheduledOccurrences } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

type Risk = {
  code: string;
  severity: "high" | "medium" | "low";
  penalty: number;
};

export const name = "ynab_get_financial_health_check";
export const description =
  "Builds a compact first-pass health check across cash, debt, budget stress, cleanup backlog, and near-term obligations.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  month: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("Month to analyze."),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Optional obligation anchor date."),
  topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of risks to include."),
};

function risk(code: string, severity: "high" | "medium" | "low", penalty: number): Risk {
  return { code, severity, penalty };
}

export async function execute(
  input: { planId?: string; month?: string; asOfDate?: string; topN?: number },
  api: ynab.API,
) {
  try {
    const month = normalizeMonthInput(input.month);
    const asOfDate = input.asOfDate ?? getTodayIsoDate();
    const topN = input.topN ?? 5;

    return await withResolvedPlan(input.planId, api, async (planId) => {
      const [accountsResponse, monthResponse, monthsResponse, transactionsResponse, scheduledResponse] = await Promise.all([
        api.accounts.getAccounts(planId),
        api.months.getPlanMonth(planId, month),
        api.months.getPlanMonths(planId),
        api.transactions.getTransactions(planId, month, undefined, undefined),
        api.scheduledTransactions.getScheduledTransactions(planId, undefined),
      ]);

      const accounts = accountsResponse.data.accounts;
      const monthDetail = monthResponse.data.month;
      const monthKey = monthDetail.month;
      const liquidCash = liquidCashMilliunits(accounts);
      const debt = totalDebtMilliunits(accounts);
      const netWorth = netWorthMilliunits(accounts);
      const overspentCategories = monthDetail.categories.filter((category) => !category.deleted && !category.hidden && category.balance < 0);
      const underfundedCategories = monthDetail.categories.filter((category) => !category.deleted && !category.hidden && (category.goal_under_funded ?? 0) > 0);
      const transactions = transactionsResponse.data.transactions.filter(
        (transaction) => !transaction.deleted
          && !isTransferTransaction(transaction)
          && (typeof transaction.date !== "string" || isWithinMonthRange(transaction.date, monthKey, monthKey)),
      );
      const uncategorizedTransactionCount = transactions.filter((transaction) => !transaction.category_id).length;
      const unapprovedTransactionCount = transactions.filter((transaction) => !transaction.approved).length;
      const unclearedTransactionCount = transactions.filter((transaction) => transaction.cleared === "uncleared").length;
      const recentIncomeMonths = recentMonths(monthsResponse.data.months, monthKey, 3);
      const incomeVolatility = spreadPercent(recentIncomeMonths.map((entry) => entry.income ?? 0));
      const upcoming30dNet = expandScheduledOccurrences(
        scheduledResponse.data.scheduled_transactions.filter((transaction) => !transaction.deleted),
        asOfDate,
        30,
      ).reduce((sum, transaction) => sum + transaction.amount, 0);

      const risks: Risk[] = [];
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

      return toTextResult({
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
        recommended_tools: [
          "ynab_get_budget_health_summary",
          "ynab_get_budget_cleanup_summary",
          "ynab_search_transactions",
          "ynab_get_upcoming_obligations",
          "ynab_get_income_summary",
        ],
      });
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
