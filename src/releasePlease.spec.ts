import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getPackageVersion } from "./packageInfo.js";

describe("release-please automation", () => {
  it("defines a release-please workflow", () => {
    const workflow = readFileSync(new URL("../.github/workflows/release-please.yml", import.meta.url), "utf8");

    expect(workflow).toContain("googleapis/release-please-action@v4");
    expect(workflow).toContain("config-file: .release-please-config.json");
    expect(workflow).toContain("manifest-file: .release-please-manifest.json");
  });

  it("tracks the current package version in the release manifest", () => {
    const config = JSON.parse(
      readFileSync(new URL("../.release-please-config.json", import.meta.url), "utf8"),
    );
    const manifest = JSON.parse(
      readFileSync(new URL("../.release-please-manifest.json", import.meta.url), "utf8"),
    );

    expect(config.packages["."]).toMatchObject({
      "package-name": "ynab-mcp-bridge",
      "release-type": "node",
    });
    expect(manifest["."]).toBe(getPackageVersion());
  });
});
