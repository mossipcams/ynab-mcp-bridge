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

  it("defines a PR title validation workflow for releasable conventional commits", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/validate-pr-title.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("pull_request_target");
    expect(workflow).toContain("PR title must use a releasable Conventional Commit title");
    expect(workflow).toContain("feat|fix|deps|revert");
  });

  it("documents squash merge and releasable PR titles for release automation", () => {
    const instructions = readFileSync(new URL("../CLAUDE.md", import.meta.url), "utf8");

    expect(instructions).toContain("Use squash merge");
    expect(instructions).toContain("The PR title must be a releasable Conventional Commit");
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
