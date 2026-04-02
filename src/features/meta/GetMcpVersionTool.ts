import * as ynab from "ynab";

import { getPackageInfo } from "../../packageInfo.js";
import { toTextResult } from "../../planToolUtils.js";

export const name = "ynab_get_mcp_version";
export const description = "Returns the MCP server release version from package metadata.";
export const inputSchema = {};

export async function execute(_input: Record<string, never>, _api: ynab.API) {
  const packageInfo = getPackageInfo();

  return toTextResult({
    name: packageInfo.name,
    version: packageInfo.version,
  });
}
