import { readFileSync } from "node:fs";
import { getStringValue, isRecord } from "./typeUtils.js";
let cachedPackageInfo;
export function getPackageInfo() {
    if (!cachedPackageInfo) {
        const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
        if (!isRecord(packageJson)) {
            throw new Error("package.json must contain an object");
        }
        const name = getStringValue(packageJson, "name");
        const version = getStringValue(packageJson, "version");
        if (!name || !version) {
            throw new Error("package.json must contain string name and version fields");
        }
        cachedPackageInfo = {
            name,
            version,
        };
    }
    return cachedPackageInfo;
}
export function getPackageVersion() {
    return getPackageInfo().version;
}
