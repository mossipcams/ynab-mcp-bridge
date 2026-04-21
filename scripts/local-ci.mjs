import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const steps = [
  ["npm", ["run", "test:ci"]],
  ["npm", ["run", "test:coverage"]],
  ["npm", ["run", "lint:deps"]],
  ["npm", ["run", "lint"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "lint:unused"]],
  ["npm", ["run", "build"]],
];

function formatStep([command, args]) {
  return [command, ...args].join(" ");
}

function runStep([command, args], index) {
  const label = `${index + 1}/${steps.length}`;
  const formattedStep = formatStep([command, args]);

  console.log(`[local-ci] ${label} ${formattedStep}`);

  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

if (process.argv.includes("--dry-run")) {
  steps.forEach((step, index) => {
    console.log(`${index + 1}. ${formatStep(step)}`);
  });
  process.exit(0);
}

steps.forEach(runStep);
