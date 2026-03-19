import { z } from "zod";
import * as ynab from "ynab";

import { compactObject } from "./financeToolUtils.js";
import { hasCollectionControls, paginateEntries } from "./collectionToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const name = "ynab_list_categories";
export const description =
  "Lists category groups for a YNAB plan with optional category expansion controls, compact projections, and pagination.";
const categoryGroupFields = [
  "name",
  "categories",
] as const;
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  limit: z.number().int().min(1).max(500).optional().describe("Maximum number of category groups to return."),
  offset: z.number().int().min(0).optional().describe("Number of category groups to skip before returning results."),
  includeIds: z.boolean().optional().describe("When false, omits category group and category ids from the output."),
  fields: z.array(z.enum(categoryGroupFields)).optional().describe("Optional category group fields to include in each row."),
};

export async function execute(
  input: {
    planId?: string;
    limit?: number;
    offset?: number;
    includeIds?: boolean;
    fields?: Array<(typeof categoryGroupFields)[number]>;
  },
  api: ynab.API,
) {
  try {
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.categories.getCategories(planId));
    const groups = response.data.category_groups
      .filter((group) => !group.deleted && !group.hidden)
      .map((group) => compactObject({
        id: input.includeIds === false ? undefined : group.id,
        name: group.name,
        categories: group.categories
          .filter((category) => !category.deleted && !category.hidden)
          .map((category) => compactObject({
            id: input.includeIds === false ? undefined : category.id,
            name: category.name,
          })),
      }));

    if (!hasCollectionControls(input)) {
      return toTextResult({
        category_groups: groups,
      });
    }

    const requestedFields = input.fields?.length ? new Set(input.fields) : new Set(categoryGroupFields);
    const pagedGroups = paginateEntries(groups, input);

    return toTextResult({
      category_groups: pagedGroups.entries.map((group) => compactObject({
        id: input.includeIds === false ? undefined : group.id,
        name: requestedFields.has("name") ? group.name : undefined,
        categories: requestedFields.has("categories") ? group.categories : undefined,
      })),
      category_group_count: groups.length,
      ...pagedGroups.metadata,
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
