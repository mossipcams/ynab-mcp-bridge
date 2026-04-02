import { toErrorResult, toTextResult } from "../../planToolUtils.js";
export const name = "ynab_list_plans";
export const description = "Lists all available YNAB plans and identifies the default plan when one exists.";
export const inputSchema = {};
export async function execute(_input, api) {
    try {
        const response = await api.plans.getPlans();
        return toTextResult({
            plans: response.data.plans.map((plan) => ({
                id: plan.id,
                name: plan.name,
                last_modified_on: plan.last_modified_on,
            })),
            default_plan: response.data.default_plan
                ? {
                    id: response.data.default_plan.id,
                    name: response.data.default_plan.name,
                }
                : null,
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
