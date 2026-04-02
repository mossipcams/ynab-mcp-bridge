import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("vertical slice catalog seam", () => {
  it("routes serverRuntime tool registration through feature catalogs", () => {
    expect(existsSync(new URL("./features/index.ts", import.meta.url))).toBe(true);

    const serverRuntimeSource = readFileSync(new URL("./serverRuntime.ts", import.meta.url), "utf8");

    expect(serverRuntimeSource).toContain('from "./features/index.js"');
    expect(serverRuntimeSource).not.toContain('from "./tools/GetAccountTool.js"');
    expect(serverRuntimeSource).not.toContain('from "./tools/ListTransactionsTool.js"');
  });
});
