import { constants } from "node:fs";
import { access } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function pathExists(relativePath: string) {
  try {
    await access(new URL(`../${relativePath}`, import.meta.url), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe("pre-refactor oauth layout", () => {
  it("matches the v0.6.5 module layout", async () => {
    await expect(pathExists("src/oauthTestHelpers.ts")).resolves.toBe(true);
    await expect(pathExists("src/__test__/oauthTestHelpers.ts")).resolves.toBe(false);
    await expect(pathExists("src/oauthConsentPage.ts")).resolves.toBe(false);
    await expect(pathExists("src/oauthJwt.ts")).resolves.toBe(false);
    await expect(pathExists("src/oauthUpstream.ts")).resolves.toBe(false);
    await expect(pathExists("dist/oauthConsentPage.js")).resolves.toBe(false);
    await expect(pathExists("dist/oauthJwt.js")).resolves.toBe(false);
    await expect(pathExists("dist/oauthUpstream.js")).resolves.toBe(false);
  });
});
