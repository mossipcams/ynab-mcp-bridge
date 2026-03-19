import { z } from "zod";
import * as ynab from "ynab";

import {
  formatAmount,
  formatRatio,
  liquidCashMilliunits,
  totalDebtMilliunits,
} from "./financialDiagnosticsUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const name = "ynab_get_debt_summary";
export const description =
  "Summarizes debt balances, concentration, and cash pressure from debt accounts.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of debt accounts to include."),
};

export async function execute(
  input: { planId?: string; topN?: number },
  api: ynab.API,
) {
  try {
    const topN = input.topN ?? 5;
    return await withResolvedPlan(input.planId, api, async (planId) => {
      const response = await api.accounts.getAccounts(planId);
      const accounts = response.data.accounts.filter((account) => !account.deleted && !account.closed);
      const debtAccounts = accounts.filter((account) => account.balance < 0)
        .sort((left, right) => left.balance - right.balance);
      const totalDebt = totalDebtMilliunits(accounts);
      const liquidCash = liquidCashMilliunits(accounts);
      const ratio = totalDebt === 0 ? 0 : liquidCash === 0 ? Number.POSITIVE_INFINITY : totalDebt / liquidCash;
      const status = totalDebt === 0 ? "none" : ratio <= 1 ? "manageable" : ratio <= 2 ? "watch" : "high";

      return toTextResult({
        total_debt: formatAmount(totalDebt),
        liquid_cash: formatAmount(liquidCash),
        debt_account_count: debtAccounts.length,
        debt_to_cash_ratio: Number.isFinite(ratio) ? formatRatio(ratio) : undefined,
        status,
        top_debt_accounts: debtAccounts.slice(0, topN).map((account) => ({
          id: account.id,
          name: account.name,
          type: account.type,
          balance: formatAmount(Math.abs(account.balance)),
        })),
      });
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
