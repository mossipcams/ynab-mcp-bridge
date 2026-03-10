import * as ynab from "ynab";

import { toErrorResult, toTextResult } from "./planToolUtils.js";

export const name = "ynab_get_user";
export const description = "Gets the authenticated YNAB user.";
export const inputSchema = {};

export async function execute(_input: Record<string, never>, api: ynab.API) {
  try {
    const response = await api.user.getUser();
    return toTextResult({
      user: response.data.user,
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
