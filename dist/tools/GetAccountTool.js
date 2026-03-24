import { z } from "zod";
import { compactObject, formatMilliunits } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_account";
export const description = "Gets a single account by ID. Returns a compact projection by default, with an explicit full-view opt-in.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    accountId: z.string().describe("The account ID to fetch."),
    view: z.enum(["compact", "full"]).default("compact").optional().describe("Returns a compact projection by default, or the full account payload when set to 'full'."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.accounts.getAccountById(planId, input.accountId));
        const account = response.data.account;
        if (input.view === "full") {
            return toTextResult({
                account,
            });
        }
        return toTextResult({
            account: compactObject({
                id: account.id,
                name: account.name,
                type: account.type,
                on_budget: account.on_budget,
                closed: account.closed,
                balance: account.balance == null ? undefined : formatMilliunits(account.balance),
            }),
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
