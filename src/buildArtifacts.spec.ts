import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("build artifact hygiene", () => {
  it("excludes oauth test helpers from the runtime TypeScript build", () => {
    const tsconfig = JSON.parse(
      readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8"),
    ) as {
      exclude?: string[];
    };

    expect(tsconfig.exclude).toEqual(expect.arrayContaining([
      "src/oauthTestHelpers.ts",
    ]));
  });
});
