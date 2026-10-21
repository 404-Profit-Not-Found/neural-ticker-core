# Fáza 0 / krok 4 — Neon heslá (ručne v Neon konzole)

Čo sa stalo (RAN 2026-10-21, `git grep` cez 713 revízií PUBLIC repa):
- commity `b7bd91dd` a `3427d790` (január 2026) obsahovali connection string role `neondb_owner`
  na **prod** endpoint `ep-red-sun-…` aj na **dev** endpoint `ep-quiet-fire-…`, **s rovnakým heslom**;
- commit `2dd156b9` obsahoval ešte starší endpoint `ep-fancy-paper-…` s iným heslom;
- súbory boli zmazané (`check-prod-tables.js` 2026-01-21, `fix-prod-schema.js` 2026-01-26,
  `compare-schemas.ts` prepísaný 2026-06-10), v histórii ostávajú navždy.

Čo je overené: heslo v dnešnom `DATABASE_URL` v Cloud Run **sa líši** od toho v histórii
(porovnané SHA-256, hodnoty nikde nevypísané). Prod heslo teda už bolo zmenené — Neon má jedno
heslo na rolu a branch, staré prestalo platiť pri resete.

Čo overené nie je: **dev branch** (`ep-quiet-fire-…`) a starý endpoint `ep-fancy-paper-…`.

## Postup (5 minút)
1. Neon konzola → projekt `withered-firefly-46921239` → **Branches**.
2. Pre dev branch (endpoint `ep-quiet-fire-…`): **Roles & Databases → `neondb_owner` → Reset password**.
   Ak dev branch nepoužívaš, radšej ho **zmaž** (žiadne heslo = žiadny únik).
3. Over, že endpoint `ep-fancy-paper-…` v projekte už neexistuje (iný projekt/branch zmazaný).
   Ak existuje, reset hesla alebo zmazať.
4. Prod (`ep-red-sun-…`): reset **nie je nutný** (heslo už je iné). Ak ho aj tak chceš urobiť,
   po resete okamžite:
   ```bash
   # nový connection string vlož raz, bez echa (read -s), potom:
   read -r -s -p "nový DATABASE_URL: " DBURL; echo
   gcloud run services update neural-ticker-core --region us-central1 --project neuro-b7a51 \
     --update-env-vars "^|^DATABASE_URL=$DBURL" --quiet       # ^|^ = vlastný oddeľovač, lebo URL má & a =
   printf '%s' "$DBURL" | gh secret set DATABASE_URL --env prod --repo 404-Profit-Not-Found/neural-ticker-core
   printf '%s' "$DBURL" | gh secret set DATABASE_URL --repo 404-Profit-Not-Found/neural-ticker-core
   unset DBURL
   ```
   Výpadok: pár sekúnd medzi resetom a novou revíziou (crony to prežijú, používatelia uvidia chybu).
5. Neon → **Settings → IP Allow** (len na platených plánoch): zvážiť povoliť len Cloud Run egress,
   ale Cloud Run bez VPC konektora nemá statickú IP — zatiaľ nechať otvorené, zapísať ako P2.
