import { z } from "zod";
import * as ynab from "ynab";

import {
  buildAccountSnapshotSummary,
  buildAssignedSpentSummary,
  compactObject,
  formatMilliunits,
  toSpentMilliunits,
  toTopRollups,
} from "./financeToolUtils.js";
import { getCachedAccounts, getCachedPlanMonth } from "./cachedYnabReads.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "../runtimePlanToolUtils.js";

export const name = "ynab_get_financial_snapshot";
export const description =
  "Returns a compact personal finance snapshot with net worth, cash, debt, and assigned versus spent. `assigned_vs_spent` reflects budget timing and buffering, not a discipline score.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  month: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe(
    "The month in ISO format or the string 'current'.",
  ),
};

export async function execute(input: { planId?: string; month?: string }, api: ynab.API) {
  try {
    const month = input.month || "current";
    const result = await withResolvedPlan(input.planId, api, async (planId) => {
      const [accountsResponse, monthResponse] = await Promise.all([
        getCachedAccounts(api, planId),
        getCachedPlanMonth(api, planId, month),
      ]);

      const {
        activeAccounts,
        positiveAccounts,
        negativeAccounts,
        netWorthMilliunits,
        liquidCashMilliunits,
        onBudgetAccountCount,
      } = buildAccountSnapshotSummary(accountsResponse.data.accounts);
      const monthDetail = monthResponse.data.month;
      const spentMilliunits = toSpentMilliunits(monthDetail.activity);

      return toTextResult(compactObject({
        month: monthDetail.month,
        net_worth: formatMilliunits(netWorthMilliunits),
        liquid_cash: formatMilliunits(liquidCashMilliunits),
        debt: formatMilliunits(
          negativeAccounts.reduce((sum, account) => sum + Math.abs(account.balance), 0),
        ),
        ready_to_assign: formatMilliunits(monthDetail.to_be_budgeted),
        income: formatMilliunits(monthDetail.income),
        ...buildAssignedSpentSummary(monthDetail.budgeted, spentMilliunits),
        age_of_money: monthDetail.age_of_money,
        account_count: activeAccounts.length,
        on_budget_account_count: onBudgetAccountCount,
        debt_account_count: negativeAccounts.length,
        top_asset_accounts: toTopRollups(
          positiveAccounts.map((account) => ({
            id: account.id,
            name: account.name,
            amountMilliunits: account.balance,
          })),
          3,
        ),
        top_debt_accounts: toTopRollups(
          negativeAccounts.map((account) => ({
            id: account.id,
            name: account.name,
            amountMilliunits: Math.abs(account.balance),
          })),
          3,
        ),
      }));
    });

    return result;
  } catch (error) {
    return toErrorResult(error);
  }
}
