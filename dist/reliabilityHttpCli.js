#!/usr/bin/env node
import { executeReliabilityHttpCli } from "./reliabilityHttp.js";
async function main() {
    process.exitCode = await executeReliabilityHttpCli(process.argv.slice(2));
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
