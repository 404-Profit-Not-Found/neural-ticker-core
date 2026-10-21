#!/usr/bin/env bash
# Fáza 0 / krok 3 — ochrany repa 404-Profit-Not-Found/neural-ticker-core (PUBLIC).
#
#   1. Secret scanning push protection: ON (stav 2026-10-21: disabled; secret scanning samotné je enabled).
#      GitHub odmietne push, ktorý obsahuje rozpoznaný kľúč/token — presne to, čo sa stalo
#      s Neon connection stringami v januári a júni 2026.
#   2. Branch protection na `main`: zákaz force-push a zmazania vetvy. Bez povinných review
#      a bez povinných status checkov, aby ťa to nebrzdilo (si jediný autor). Admin (ty)
#      môže stále pushovať priamo.
set -euo pipefail

REPO=404-Profit-Not-Found/neural-ticker-core

echo "1/2 push protection…"
gh api -X PATCH "repos/$REPO" --input - <<'JSON'
{"security_and_analysis":{"secret_scanning_push_protection":{"status":"enabled"}}}
JSON
echo

echo "2/2 branch protection main…"
gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
echo

echo "Stav po zmene:"
gh api "repos/$REPO" --jq '{secret_scanning: .security_and_analysis.secret_scanning.status, push_protection: .security_and_analysis.secret_scanning_push_protection.status}'
gh api "repos/$REPO/branches/main/protection" --jq '{force_pushes: .allow_force_pushes.enabled, deletions: .allow_deletions.enabled}'
