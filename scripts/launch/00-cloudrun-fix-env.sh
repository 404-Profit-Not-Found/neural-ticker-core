#!/usr/bin/env bash
# Fáza 0 / krok 2 — odstráni z env Cloud Run služby `neural-ticker-core` (neuro-b7a51,
# us-central1) rozbitú premennú GCP_SA_KEY a všetky "premenné", ktoré vznikli rozsekaním
# JSON servisného účtu na čiarkach (vrátane privátneho kľúča), zahodí prázdne APP_PORT
# a nastaví APP_ENV=prod (povolené hodnoty podľa src/config/validation.ts: local | dev | prod).
#
# Pracuje len s NÁZVAMI premenných (`--remove-env-vars`), hodnoty tajomstiev nečíta ani
# nezapisuje. Firebase Admin už dnes beží cez ADC ("initialized (ADC or default)" v logoch),
# takže sa funkčne nič nemení. Vznikne jedna nová revízia so 100 % traffic.
# Rollback: Cloud Run konzola → Revisions → traffic na predchádzajúcu revíziu.
#
# RESEARCH_SHARE_SECRET a USER_SECRETS_KEYS sa nastavujú samostatne: scripts/launch/04-secrets.md.
set -euo pipefail

PROJECT=neuro-b7a51
REGION=us-central1
SERVICE=neural-ticker-core

command -v gcloud >/dev/null || { echo "chýba gcloud"; exit 1; }
command -v python3 >/dev/null || { echo "chýba python3"; exit 1; }

echo "1/3 čítam názvy env premenných služby…"
REMOVE=$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" --format=json \
  | python3 -c '
import json, re, sys
svc = json.load(sys.stdin)
env = svc["spec"]["template"]["spec"]["containers"][0].get("env", [])
bad = [e["name"] for e in env
       if not re.fullmatch(r"[A-Z][A-Z0-9_]*", e["name"]) or e["name"] in ("GCP_SA_KEY", "APP_PORT")]
if not bad:
    sys.exit("nič na odstránenie — env je už čistý")
sys.stderr.write(f"na odstránenie: {len(bad)} položiek (GCP_SA_KEY, APP_PORT a rozsekaný JSON)\n")
# ^|^ = vlastný oddeľovač pre gcloud: názvy obsahujú čiarky-nie, ale úvodzovky, dvojbodky a medzery áno
print("^|^" + "|".join(bad))
')

echo
echo "2/3 nasadím novú revíziu bez týchto položiek a s APP_ENV=prod."
read -r -p "   Pokračovať? [y/N] " ok
[[ "$ok" == [yY] ]] || { echo "zrušené, nič sa nezmenilo"; exit 1; }
gcloud run services update "$SERVICE" --region "$REGION" --project "$PROJECT" \
  --remove-env-vars "$REMOVE" --update-env-vars APP_ENV=prod --quiet

echo "3/3 overujem…"
sleep 8
echo "   názvy env premenných po zmene (nesmie tam byť úvodzovka ani GCP_SA_KEY):"
gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" \
  --format='value(spec.template.spec.containers[0].env[].name)' | tr ';' '\n' | sed 's/^/     /'
echo "   health:"
curl -fsS --max-time 20 "https://neuralticker.com/api/v1/health" | head -c 300 || echo "     (health nedostupný — skontroluj logy)"
echo
echo "   Firebase init v logoch (posledných 10 min):"
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE AND textPayload:FirebaseService" \
  --project "$PROJECT" --freshness=10m --limit=4 --format='value(timestamp,textPayload)' | sed 's/^/     /' || true
echo
echo "Hotovo. Očakávané: 'Firebase Admin initialized (ADC or default)' a ŽIADNE 'not valid JSON or Base64'."
echo "Ďalej: scripts/launch/04-secrets.md (RESEARCH_SHARE_SECRET, USER_SECRETS_KEYS), potom 01-delete-leaked-sa-key.sh."
