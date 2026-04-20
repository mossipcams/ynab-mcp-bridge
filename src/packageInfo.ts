import { readFileSync } from "node:fs";

import { getStringValue, isRecord } from "./typeUtils.js";

type PackageInfo = {
  name: string;
  version: string;
};

let cachedPackageInfo: PackageInfo | undefined;

export function getPackageInfo(): PackageInfo {
  if (!cachedPackageInfo) {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );

    if (!isRecord(packageJson)) {
      throw new Error("package.json must contain an object");
    }

    const name = getStringValue(packageJson, "name");
    const version = getStringValue(packageJson, "version");

    if (!name || !version) {
      throw new Error("package.json must contain string name and version fields");
    }

    cachedPackageInfo = Object.freeze({
      name,
      version,
    });
  }

  return cachedPackageInfo;
}

export function getPackageVersion() {
  return getPackageInfo().version;
}
