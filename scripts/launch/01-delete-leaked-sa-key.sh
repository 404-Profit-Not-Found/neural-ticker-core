#!/usr/bin/env bash
# Fáza 0 / krok 2 — zmaže uniknutý user-managed kľúč servisného účtu
# firebase-adminsdk-fbsvc@neuro-b7a51.iam.gserviceaccount.com a GitHub secret GCP_SA_KEY.
#
#   c3223066b17c919dd1ff2dcb3713e947d1e77620  vytvorený 2025-12-05, naposledy použitý
#       2026-10-16 (Policy Analyzer, čítané 2026-10-21) = GitHub Actions deploy.yml;
#       jeho JSON je ten, ktorý skončil rozsekaný v Cloud Run env.
#   ec7673f06eb624d092fb969bfbe381d9a168ea8b  vytvorený 2025-12-09, naposledy použitý
#       2026-03-13 — 7 mesiacov nepoužitý; zmaže sa len s prepínačom --also-stale.
#
# Podmienky (skript ich overí): 00-cloudrun-fix-env.sh prebehol a .github/workflows/deploy.yml
# už nemá push trigger (deploy robí Cloud Build trigger, ktorý kľúč nepotrebuje).
# Dopad: ručný beh deploy.yml prestane fungovať, kým nevznikne nový kľúč alebo WIF.
set -euo pipefail

PROJECT=neuro-b7a51
SA=firebase-adminsdk-fbsvc@neuro-b7a51.iam.gserviceaccount.com
REPO=404-Profit-Not-Found/neural-ticker-core
LEAKED=c3223066b17c919dd1ff2dcb3713e947d1e77620
STALE=ec7673f06eb624d092fb969bfbe381d9a168ea8b

cd "$(git rev-parse --show-toplevel)"

if grep -qE '^\s*push:' .github/workflows/deploy.yml; then
  echo "deploy.yml má stále push trigger — najprv commitni/mergni zmenu z Fázy 0 (commit-phase0.sh)."
  exit 1
fi
if gcloud run services describe neural-ticker-core --region us-central1 --project "$PROJECT" \
     --format='value(spec.template.spec.containers[0].env[].name)' | tr ';' '\n' | grep -qE 'GCP_SA_KEY|"'; then
  echo "Cloud Run env stále obsahuje GCP_SA_KEY alebo rozsekaný JSON — najprv spusti 00-cloudrun-fix-env.sh."
  exit 1
fi

echo "User-managed kľúče servisného účtu $SA:"
gcloud iam service-accounts keys list --iam-account "$SA" --project "$PROJECT" --managed-by user
echo
read -r -p "Zmazať kľúč $LEAKED a GitHub secret GCP_SA_KEY (repo + env prod)? [y/N] " ok
[[ "$ok" == [yY] ]] || { echo "zrušené"; exit 1; }

gcloud iam service-accounts keys delete "$LEAKED" --iam-account "$SA" --project "$PROJECT" --quiet
echo "kľúč $LEAKED zmazaný"

if [[ "${1:-}" == "--also-stale" ]]; then
  gcloud iam service-accounts keys delete "$STALE" --iam-account "$SA" --project "$PROJECT" --quiet
  echo "kľúč $STALE zmazaný"
fi

gh secret delete GCP_SA_KEY --repo "$REPO" 2>/dev/null && echo "GitHub secret GCP_SA_KEY (repo) zmazaný" || echo "GitHub secret GCP_SA_KEY (repo) už neexistuje"
gh secret delete GCP_SA_KEY --env prod --repo "$REPO" 2>/dev/null && echo "GitHub secret GCP_SA_KEY (env prod) zmazaný" || echo "GitHub secret GCP_SA_KEY (env prod) už neexistuje"

echo
echo "Hotovo. Over: prihlásenie cez Google na https://neuralticker.com funguje (nezávisí od tohto kľúča),"
echo "a v logoch je 'Firebase Admin initialized (ADC or default)'."
