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

  it("does not let callers mutate the cached package metadata", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const packageInfo = getPackageInfo() as {
      name: string;
      version: string;
    };

    try {
      packageInfo.version = "0.0.0-mutated";
    } catch {
      // Frozen objects may reject direct assignment in strict mode.
    }

    expect(getPackageVersion()).toBe(packageJson.version);
    expect(getPackageInfo()).toMatchObject({
      name: packageJson.name,
      version: packageJson.version,
    });
  });
});
