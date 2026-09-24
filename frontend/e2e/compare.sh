#!/usr/bin/env bash
# Visual + functional diff of the current working tree against a base ref.
#
#   npm run e2e:compare            # vs main
#   npm run e2e:compare -- v1.2.0  # vs any ref
#
# 1. checks the base ref out into a temporary git worktree,
# 2. runs THIS e2e suite (same specs, same mocks) there to capture its
#    screenshots as the baseline,
# 3. runs the suite on the working tree against that baseline.
# The HTML report (playwright-report-vs-<ref>) then shows, per screenshot,
# expected (base) / actual (yours) / diff. Tests that fail on the base only
# because a feature doesn't exist there yet show up as missing baselines.
set -euo pipefail

BASE="${1:-main}"
FRONTEND="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(git -C "$FRONTEND" rev-parse --show-toplevel)"
SAFE_BASE="$(echo "$BASE" | tr '/:' '__')"
TMP="$(mktemp -d)"
cleanup() {
  git -C "$REPO" worktree remove --force "$TMP/base" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "▶ checking out $BASE ($(git -C "$REPO" rev-parse --short "$BASE"))"
git -C "$REPO" worktree add --detach "$TMP/base" "$BASE" >/dev/null 2>&1
BASE_FE="$TMP/base/frontend"

echo "▶ installing base dependencies"
PW_VERSION="$(node -p "require('$FRONTEND/node_modules/@playwright/test/package.json').version")"
(cd "$BASE_FE" && npm ci --no-audit --no-fund --silent && npm i --no-save --no-audit --no-fund --silent "@playwright/test@$PW_VERSION")

rm -rf "$BASE_FE/e2e"
cp -R "$FRONTEND/e2e" "$BASE_FE/e2e"
rm -rf "$BASE_FE/e2e/__snapshots__"
cp "$FRONTEND/playwright.config.ts" "$BASE_FE/"

BASE_LOG="$FRONTEND/e2e-compare-vs-$SAFE_BASE.base.log"
echo "▶ capturing $BASE screenshots (log: $(basename "$BASE_LOG"))"
(cd "$BASE_FE" && E2E_PORT=5198 E2E_SNAPSHOT_DIR="$TMP/snapshots" E2E_OUTPUT_DIR="$TMP/base-results" \
  E2E_REPORT_DIR="$TMP/base-report" npx playwright test --update-snapshots --reporter=list) >"$BASE_LOG" 2>&1 || true
# Failures on the base are expected for features that don't exist there yet.
echo "  $BASE: $(grep -E '^\s+[0-9]+ (passed|failed|flaky|skipped)' "$BASE_LOG" | xargs)"

echo "▶ comparing working tree against $BASE"
cd "$FRONTEND"
set +e
E2E_SNAPSHOT_DIR="$TMP/snapshots" E2E_OUTPUT_DIR="test-results-vs-$SAFE_BASE" \
  E2E_REPORT_DIR="playwright-report-vs-$SAFE_BASE" npx playwright test
STATUS=$?
set -e
echo
echo "Report: npx playwright show-report playwright-report-vs-$SAFE_BASE"
exit $STATUS
