#!/usr/bin/env node

import { executeReliabilityLoadCli } from "./reliabilityLoadSuite.js";

async function main() {
  process.exitCode = await executeReliabilityLoadCli(process.argv.slice(2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
