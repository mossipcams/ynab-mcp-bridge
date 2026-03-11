import { z } from "zod";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_list_accounts";
export const description = "Lists accounts for a single YNAB plan.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.accounts.getAccounts(planId));
        const accounts = response.data.accounts
            .filter((account) => !account.deleted)
            .map((account) => ({
            id: account.id,
            name: account.name,
            type: account.type,
            closed: account.closed,
            balance: (account.balance / 1000).toFixed(2),
        }));
        return toTextResult({
            accounts,
            account_count: accounts.length,
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
