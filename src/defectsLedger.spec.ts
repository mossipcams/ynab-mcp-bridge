import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("defect ledger", () => {
  it("defines a root defect ledger with severity sections for confirmed production issues", () => {
    const defectsPath = new URL("../defects.md", import.meta.url);

    expect(existsSync(defectsPath)).toBe(true);

    const contents = readFileSync(defectsPath, "utf8");

    expect(contents).toContain("# Defect Ledger");
    expect(contents).toContain("## Critical");
    expect(contents).toContain("## High");
    expect(contents).toContain("## Medium");
    expect(contents).toContain("Status:");
  });
});
