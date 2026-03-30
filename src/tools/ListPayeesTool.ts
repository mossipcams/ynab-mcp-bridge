import { z } from "zod";
import * as ynab from "ynab";

import {
  hasPaginationControls,
  hasProjectionControls,
  paginateEntries,
  projectRecord,
} from "./collectionToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "../runtimePlanToolUtils.js";

export const name = "ynab_list_payees";
export const description =
  "Lists payees for a YNAB plan with optional compact projections and pagination.";
const payeeFields = [
  "name",
  "transfer_account_id",
] as const;
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  limit: z.number().int().min(1).max(500).optional().describe("Maximum number of payees to return."),
  offset: z.number().int().min(0).optional().describe("Number of payees to skip before returning results."),
  includeIds: z.boolean().optional().describe("When false, omits payee ids from the output."),
  fields: z.array(z.enum(payeeFields)).optional().describe("Optional payee fields to include in each row."),
};

export async function execute(
  input: {
    planId?: string;
    limit?: number;
    offset?: number;
    includeIds?: boolean;
    fields?: Array<(typeof payeeFields)[number]>;
  },
  api: ynab.API,
) {
  try {
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.payees.getPayees(planId));
    const payees = response.data.payees
      .filter((payee) => !payee.deleted)
      .map((payee) => ({
        id: payee.id,
        name: payee.name,
        transfer_account_id: payee.transfer_account_id,
      }));

    if (!hasPaginationControls(input) && !hasProjectionControls(input)) {
      return toTextResult({
        payees,
        payee_count: payees.length,
      });
    }

    if (!hasPaginationControls(input)) {
      return toTextResult({
        payees: payees.map((payee) => projectRecord(payee, payeeFields, input)),
        payee_count: payees.length,
      });
    }

    const pagedPayees = paginateEntries(payees, input);

    return toTextResult({
      payees: pagedPayees.entries.map((payee) => projectRecord(payee, payeeFields, input)),
      payee_count: payees.length,
      ...pagedPayees.metadata,
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
