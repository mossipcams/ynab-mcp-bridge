import { readFileSync } from "node:fs";

type PackageInfo = {
  name: string;
  version: string;
};

let cachedPackageInfo: PackageInfo | undefined;

export function getPackageInfo(): PackageInfo {
  if (!cachedPackageInfo) {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as PackageInfo;

    cachedPackageInfo = {
      name: packageJson.name,
      version: packageJson.version,
    };
  }

  return cachedPackageInfo;
}

export function getPackageVersion() {
  return getPackageInfo().version;
}
