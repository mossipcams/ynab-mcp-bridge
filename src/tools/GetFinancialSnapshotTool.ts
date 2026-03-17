import { z } from "zod";
import * as ynab from "ynab";

import {
  buildAssignedSpentSummary,
  compactObject,
  formatMilliunits,
  toSpentMilliunits,
  toTopRollups,
} from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const name = "ynab_get_financial_snapshot";
export const description =
  "Returns a compact personal finance snapshot with net worth, cash, debt, and assigned versus spent.";
export const inputSchema = {
  planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
  month: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe(
    "Month as YYYY-MM-DD or 'current'.",
  ),
};

function isActiveAccount(account: ynab.Account) {
  return !account.deleted && !account.closed;
}

export async function execute(input: { planId?: string; month?: string }, api: ynab.API) {
  try {
    const month = input.month || "current";
    const result = await withResolvedPlan(input.planId, api, async (planId) => {
      const [accountsResponse, monthResponse] = await Promise.all([
        api.accounts.getAccounts(planId),
        api.months.getPlanMonth(planId, month),
      ]);

      const accounts = accountsResponse.data.accounts.filter(isActiveAccount);
      const monthDetail = monthResponse.data.month;
      const spentMilliunits = toSpentMilliunits(monthDetail.activity);

      const positiveAccounts = accounts.filter((account) => account.balance > 0);
      const negativeAccounts = accounts.filter((account) => account.balance < 0);

      return toTextResult(compactObject({
        month: monthDetail.month,
        net_worth: formatMilliunits(accounts.reduce((sum, account) => sum + account.balance, 0)),
        liquid_cash: formatMilliunits(
          accounts
            .filter((account) => account.balance > 0 && account.on_budget)
            .reduce((sum, account) => sum + account.balance, 0),
        ),
        debt: formatMilliunits(
          negativeAccounts.reduce((sum, account) => sum + Math.abs(account.balance), 0),
        ),
        ready_to_assign: formatMilliunits(monthDetail.to_be_budgeted),
        income: formatMilliunits(monthDetail.income),
        ...buildAssignedSpentSummary(monthDetail.budgeted, spentMilliunits),
        age_of_money: monthDetail.age_of_money,
        account_count: accounts.length,
        on_budget_account_count: accounts.filter((account) => account.on_budget).length,
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
