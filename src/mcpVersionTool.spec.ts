import { describe, expect, it } from "vitest";

import { getPackageInfo } from "./packageInfo.js";
import * as GetMcpVersionTool from "./tools/GetMcpVersionTool.js";

describe("GetMcpVersionTool", () => {
  it("returns the MCP server release version from package metadata", async () => {
    const result = await GetMcpVersionTool.execute({}, {} as any);

    expect(JSON.parse(result.content[0].text)).toEqual({
      name: getPackageInfo().name,
      version: getPackageInfo().version,
    });
  });
});
