import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getPackageInfo, getPackageVersion } from "./packageInfo.js";

describe("packageInfo", () => {
  it("loads the release version from package.json", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

    expect(getPackageVersion()).toBe(packageJson.version);
    expect(getPackageInfo()).toMatchObject({
      name: packageJson.name,
      version: packageJson.version,
    });
  });
});
