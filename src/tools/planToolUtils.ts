import { getErrorMessage } from "./errorUtils.js";

export function getPlanId(inputPlanId?: string): string {
  const planId = inputPlanId || process.env.YNAB_PLAN_ID || "";
  if (!planId) {
    throw new Error("No plan ID provided. Please provide a plan ID or set YNAB_PLAN_ID.");
  }
  return planId;
}

export function toTextResult(payload: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify(payload, null, 2),
    }],
  };
}

export function toErrorResult(error: unknown) {
  return toTextResult({
    success: false,
    error: getErrorMessage(error),
  });
}
