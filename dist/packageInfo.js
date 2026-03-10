import { readFileSync } from "node:fs";
let cachedPackageInfo;
export function getPackageInfo() {
    if (!cachedPackageInfo) {
        const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
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
