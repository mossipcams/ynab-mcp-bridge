#!/bin/bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

mkdir -p artifacts/jscpd-report
npm run --silent lint:duplicates >/tmp/ynab-mcp-bridge-jscpd.log 2>&1

count_matches() {
  local pattern="$1"
  { grep -r -E "$pattern" src/ 2>/dev/null || true; } | wc -l | tr -d ' '
}

echo "=== Tech Debt Report ==="
echo "Duplication: $(jq '.statistics.total.percentage' artifacts/jscpd-report/jscpd-report.json)%"
echo "Dead exports: $(npx knip --reporter json --production --exclude dependencies 2>/dev/null | jq '.files | length')"
echo "ts-ignore count: $(count_matches '@ts-ignore|@ts-expect-error')"
echo "eslint-disable count: $(count_matches 'eslint-disable')"
echo "TODO/FIXME/HACK count: $(count_matches 'TODO|FIXME|HACK')"
echo "Dependencies with major updates: $(npx npm-check-updates --target greatest --jsonUpgraded 2>/dev/null | jq 'length')"
