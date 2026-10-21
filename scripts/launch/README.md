# Launch — Fáza 0 (bezpečnostná hygiena pred verejným otvorením)

Podklad: `docs/PUBLIC_LAUNCH_ASSESSMENT_2026-10-21.md`, §6 (P0) a §9 (Fáza 0).
Všetko spúšťaš ty; skripty sa pred každou zmenou pýtajú `[y/N]` a nevypisujú hodnoty tajomstiev.
Predpoklady: `gcloud` prihlásený ako branislavlang@gmail.com, `gh` prihlásený, `python3`, `openssl`, `node`.

## Poradie
| # | Čo | Ako | Rieši |
|---|---|---|---|
| 1 | Commit zmien v repe (deploy.yml bez push triggeru, .gitignore, SECURITY.md, hygiena, tento balík) | `scripts/launch/commit-phase0.sh` → `git push` → PR → merge | P1-1 (jeden deploy kanál), P2 hygiena |
| 2 | Vyčistiť Cloud Run env (zmazať `GCP_SA_KEY` a rozsekaný JSON, `APP_ENV=prod`); pracuje len s názvami premenných | `scripts/launch/00-cloudrun-fix-env.sh` | P0-1 (kľúč v env) |
| 2b | Nastaviť `RESEARCH_SHARE_SECRET` a `USER_SECRETS_KEYS` | `scripts/launch/04-secrets.md` (dva príkazy, hodnoty sa nevypisujú) | P0-3 (share linky), P1-4 (šifrovanie kľúčov) |
| 3 | Zmazať uniknutý SA kľúč + GitHub secret `GCP_SA_KEY` | `scripts/launch/01-delete-leaked-sa-key.sh` (voliteľne `--also-stale`) | P0-1 |
| 4 | Push protection + branch protection `main` | `scripts/launch/02-github-protections.sh` | P1-2 |
| 5 | Neon heslá (dev branch, starý endpoint) | `scripts/launch/03-neon-passwords.md` (konzola) | P0-2 |

Krok 2 môžeš spustiť aj pred mergom PR (nezávisí od kódu). Krok 3 vyžaduje, aby `deploy.yml`
v pracovnom strome už nemal `push:` trigger (skript to kontroluje) — inak by ďalší push do `main`
spustil deploy, ktorý padne na chýbajúcom kľúči (neškodné, ale zbytočný červený beh).

## Prečo Cloud Build a nie GitHub Actions
Trigger `rmgpgab-neural-ticker-core-…` (Cloud Build) buildí z `Dockerfile` a volá
`gcloud run services update --image …` ako runtime servisný účet Cloud Run — bez akéhokoľvek
kľúča v GitHube. GitHub Actions cesta potrebovala JSON kľúč servisného účtu v secrets, a ten
istý JSON prešiel cez `--set-env-vars`, kde ho čiarky rozsekali. Jedna cesta bez kľúča je menej
vecí, ktoré môžu uniknúť. Env premenné služby sú odteraz spravované na službe samotnej
(kroky 2 a 2b), nie v deploy workflow.

Commit a push celej Fázy 0 (vrátane tohto priečinka) robí skript mimo repa:
`bash ~/Documents/ESS-MAIN/COMMIT_neural-ticker-phase0_2026-10-21.sh` — vytvorí branch
`chore/launch-phase0` z `origin/main`, ukáže `diff --cached --stat`, commitne, pushne a otvorí PR.

## Čo sa NEmení v Fáze 0
Kód aplikácie, modely, kredity, prístupová politika, región. To je Fáza 1+ (§9 posúdenia),
po tvojom schválení jednotlivých krokov.

## Overenie po Fáze 0
- `gcloud run services describe neural-ticker-core --region us-central1 --project neuro-b7a51 --format='value(spec.template.spec.containers[0].env[].name)'`
  → žiadny `GCP_SA_KEY`, žiadne názvy s úvodzovkami.
- Prihlásenie cez Google na neuralticker.com funguje; share link na research vracia 200.
- `gh api repos/404-Profit-Not-Found/neural-ticker-core --jq .security_and_analysis` → push protection `enabled`.
- `gcloud iam service-accounts keys list --iam-account firebase-adminsdk-fbsvc@neuro-b7a51.iam.gserviceaccount.com --managed-by user`
  → bez `c3223066…`.
