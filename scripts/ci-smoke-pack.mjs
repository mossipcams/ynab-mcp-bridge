import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const packDir = path.join(repoRoot, "artifacts", "npm-pack");

function run(command, args) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

rmSync(packDir, { force: true, recursive: true });
mkdirSync(packDir, { recursive: true });

const packResult = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", packDir]));
const tarballName = packResult[0]?.filename;

if (typeof tarballName !== "string" || tarballName.length === 0) {
  throw new Error("npm pack did not report a tarball filename.");
}

const tarballPath = path.join(packDir, tarballName);

if (!existsSync(tarballPath)) {
  throw new Error(`Expected packed artifact at ${tarballPath}.`);
}

const tarEntries = run("tar", ["-tf", tarballPath])
  .split("\n")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);
const packageJsonEntry = "package/package.json";
const runtimeEntry = "package/dist/index.js";

if (!tarEntries.includes(packageJsonEntry)) {
  throw new Error("Packed artifact is missing package/package.json.");
}

if (!tarEntries.includes(runtimeEntry)) {
  throw new Error("Packed artifact is missing package/dist/index.js.");
}

const packedPackageJson = JSON.parse(run("tar", ["-xOf", tarballPath, packageJsonEntry]));
const binEntry = packedPackageJson?.bin?.["ynab-mcp-bridge"];

if (binEntry !== "./dist/index.js") {
  throw new Error("Packed artifact has an unexpected CLI entrypoint.");
}

console.log(`Packed artifact smoke check passed: ${tarballName}`);
