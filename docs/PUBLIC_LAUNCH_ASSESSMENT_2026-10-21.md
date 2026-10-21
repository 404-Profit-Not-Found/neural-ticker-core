# Neural-Ticker — posúdenie pred verejným otvorením

Dátum: 2026-10-21 (večer). Autor: Claude (side session), pre Branislava.
Stav kódu, ku ktorému sa vzťahujú odkazy `file:line`: **`origin/main` = commit `c0412fc`**, čo je presne revízia nasadená v Cloud Run (`neural-ticker-core-00250-22q`, label `commit-sha=c0412fc…`, RAN). Lokálny checkout je na branchi `fix/v2-feature-pass` (8 commitov navyše, 2 commity za `origin/main`) — ten som pre „čo beží v prode“ nepoužil.

**Ako čítať značky.** Každé číslo a tvrdenie nesie zdroj:
- **RAN** — spustil som to a videl výstup (gcloud, gh, git, logy, trufflehog).
- **READ** — otvoril som primárny zdroj (súbor v `origin/main`, oficiálna cenníková stránka s dátumom).
- **INFERRED** — odvodené alebo odhadnuté; nepovažuj za overené.

Žiadne hodnoty tajomstiev v tomto dokumente nie sú a nemajú byť.

---

## 0. Zhrnutie na jednu obrazovku

> **Doplnené 21. 10. večer:** tvoje rozhodnutia sú v §10, alternatíva „non-profit + dobrovoľné príspevky“ v §8B, licencie dát v §11, pripravený balík Fázy 0 v §12.

1. **Prístup je dnes zavretý na invite list v DB** (`allowed_users`) + rola `waitlist`. Kto nie je na zozname, dostane „Access Denied“; kto klikne „Join the waitlist“, vznikne s rolou `waitlist` a session nedostane. Dvaja hardcoded admini (`branislavlang@gmail.com`, `juraj.hudak79@gmail.com`) majú vstup vždy. (READ)
2. **Dnešná prevádzka je mikroskopická**: ~1 000 HTTP requestov/deň (z toho ~1/3 crony a boti), 1–4 prihlásenia/deň, **26 používateľských research behov za 30 dní**, 856 Gemini volaní za 30 dní, z toho **len 9 na platenom kľúči**. (RAN, logy Cloud Run)
3. **LLM náklady na jeden beh (odhad, paid tier):** Flash Lite ≈ **$0,02**, Flash ≈ **$0,03**, Gemini 4 Argon ≈ **$0,15** (od 1. 12. 2026 ≈ **$0,28**, Argon zdražuje 2×). Ceny READ (ai.google.dev, „Last updated 2026-10-19“), tokeny INFERRED — skutočné čísla máš v DB (`research_notes.tokens_in/out`), SQL je v prílohe B.
4. **Kreditový systém už existuje a ohraničuje škodu**: free účet má 10 kreditov raz a navždy (mesačný reset nie je implementovaný), Argon je zamknutý na `pro`. Chýba: spôsob zaplatiť, mesačný reset, denný USD strop na platený kľúč, a BYO kľúč dnes pri Argone **aj tak padne na tvoj platený kľúč**. (READ)
5. **Tri P0 nálezy, ktoré treba riešiť pred otvorením aj bez ohľadu na business model:**
   - P0-1 **Privátny kľúč servisného účtu Firebase je v Cloud Run čitateľný v otvorenej podobe** — `GCP_SA_KEY` sa pri deployi rozsekal na čiarkach a JSON (vrátane `private_key`) skončil ako názvy env premenných. Firebase sa preto inicializuje cez ADC (funguje), ale kľúč vidí každý s `run.services.get`. Dostal sa aj do výstupu môjho nástroja v tejto session → **rotuj**. (RAN)
   - P0-2 **Produkčné aj dev prihlasovacie údaje do Neon DB boli commitnuté do PUBLIC repa** (commity `b7bd91dd`, `3427d790`, `2dd156b9`; súbory zmazané v januári a júni 2026, v histórii ostávajú). Heslo v histórii **sa líši od dnešného** v Cloud Run (porovnané hashmi, RAN), čiže už bolo rotované — over v Neon konzole, že staré role/heslá sú neplatné.
   - P0-3 **`RESEARCH_SHARE_SECRET` je v Cloud Run prázdny** (secret v GitHube neexistuje) → verejné share linky na report končia 500. (RAN env + READ `research.service.ts:1924`)
6. **Repo je PUBLIC** (RAN `gh repo view`), bez branch protection na `main`, s vypnutou push protection, a obsahuje aj veci, ktoré tam asi nechceš (`.tmp-design/` 8,2 MB vrátane prepisu chatu, `.claude/settings.local.json` s cestami na tvojom Macu). Otázka zámeru je v §10.
7. **Odporúčaný model**: free tier s tvrdým mesačným limitom + predplatené balíky kreditov cez Merchant-of-Record bránu + BYO kľúč za 0 kreditov + zdieľaný systémový research + waitlist ako klapka + denný USD strop v kóde. Čísla v §8.
8. **Minimálne otvorenie bez platieb je možné hneď po P0 a fáze 1** (strop výdavkov, limity, reset kreditov): náklad pri 1 000 free používateľoch je ohraničený na ≈ $100/mesiac (INFERRED, §6).

---

## 1. Ako je dnes prístup zavretý (READ, `origin/main`)

**Tok prihlásenia (Google OAuth, jediné tlačidlo na `/login`):**
- `frontend-v2/src/pages/Login.tsx` → `startGoogleLogin()` → `GET /api/auth/google` (`frontend-v2/src/lib/base.ts:34`).
- `src/modules/auth/auth.service.ts:34-93` `validateOAuthLogin`:
  - `isEmailAllowed(email)` = email je v `DEFAULT_ADMINS` **alebo** má riadok v tabuľke `allowed_users` (`src/modules/users/users.service.ts:77-81`).
  - rola `revoked` → 401 „suspended“.
  - nie je povolený a `intent=waitlist` → vytvorí/aktualizuje usera s rolou `waitlist`, redirect na `/access-denied?error=waitlist_joined`.
  - nie je povolený, bez intentu → 401 „not on the invite list“ → `/access-denied?error=invite_only` (filter `google-auth-exception.filter.ts`).
  - povolený → user s rolou `user` (alebo `admin` ak je v `DEFAULT_ADMINS`), JWT do HttpOnly cookie `authentication` (24 h, `secure` v prode) (`auth.controller.ts:60-98`).
- Firebase cesta (`POST /api/auth/firebase`) má **rovnakú politiku** + vyžaduje `email_verified` (`auth.service.ts:106-187`). Frontend-v2 ju nepoužíva (grep), je to API cesta.
- `POST /api/auth/dev/token` je v prode vypnutý (`NODE_ENV=production` a `ENABLE_DEV_LOGIN` nie je v Cloud Run env) (READ `auth.controller.ts:128-141`, RAN env).

**Schvaľovanie:** admin v `/admin` (`AdminController`, `@Roles('admin')`): `POST admin/userlist` (pridá email na invite list), `approveUser` (waitlist → `user` + pridá na list), `DELETE admin/waitlist/:email` (odmietne), `PATCH users/:id/tier` (free/pro/whale), `POST users/:id/credits` (dar kreditov) (`src/modules/users/admin.controller.ts:44-142`).

**Globálne guardy:** `ThrottlerGuard` 300 req/min/IP (s `trust proxy`), potom `JwtAuthGuard` na všetko okrem `@Public()` (`src/app.module.ts:71-80,154-163`).

**Čo vidí anonym (`@Public()` trasy, RAN grep):** landing/SPA, `/login`, `/about`, `/privacy`, `/terms`, verejný report `GET /api/v1/public/report/:id/:signature` (HMAC, vlastný IP throttler), `health`, trhové dáta **len pre už sledované tickery** (`assertPublicReadAllowed` — anonym nikdy nevytvorí ticker ani nespustí research), indexy, kurzy, všeobecné správy, StockTwits cache, komentáre (čítanie), logo, `proxy/image` (len `*.finnhub.io`, bez redirectov), `vapid-key`, cron endpointy chránené `X-Cron-Secret` (konštantný čas porovnania). MCP endpoint je `@Public()` so „soft auth“ — anonym má dosah, nástroje si vyžadujú usera samé (`src/modules/mcp/mcp-tools.module.ts:30-49`); tu som nekontroloval každý tool.

**Záver §1:** zavreté je to správne a konzistentne na backende (nie len v UI). Otvorenie = zmena politiky v `validateOAuthLogin`/`loginWithFirebase`, nič viac sa odomknúť nemusí.

---

## 2. Čo dnes beží a čo to stojí (RAN)

### 2.1 Infraštruktúra
- **Cloud Run** `neural-ticker-core`, projekt `neuro-b7a51`, región **us-central1**, `maxScale 20`, `containerConcurrency 80`, 1 vCPU / 512 MiB, timeout 300 s, bez `minScale` (scale-to-zero), ingress all, invoker IAM vypnutý (verejné). Billing účet `0193CB-…` zapnutý. **Budget alerty som nevedel prečítať** (API vypnuté) → predpokladám, že žiadne nie sú (INFERRED).
- **Dva deploy kanály bežia naraz** pri pushi do `main`: GitHub Actions `deploy.yml` (SA key JSON → `env_vars`) **a** Cloud Build trigger `rmgpgab-…-ceo` (Cloud Run „continuous deployment“). Oba úspešné 2026-10-16 16:11 UTC. Posledný zápis env má Cloud Build; rozsekaný `GCP_SA_KEY` z Actions ostáva. (RAN `gh run list`, `gcloud builds list`, `gcloud run services describe`)
- **DB: Neon** (Postgres 17 + Timescale podľa docs), endpoint `ep-red-sun-…pooler.c-2.eu-central-1.aws.neon.tech`, `sslmode=require`. Cloud Run je v USA, DB vo Frankfurte → každý dotaz má transatlantickú latenciu (INFERRED dôsledok, nemeral som). Plán Neonu (Free/Launch) neviem prečítať (bez Neon API kľúča) → **otvorený bod**.
- **Gemini kľúče, dva Google projekty** (RAN `gcloud billing projects describe`, `api-keys list`):
  - primárny „free“ kľúč = projekt `gen-lang-client-0783334320` („free“), **billing vypnutý → skutočný free tier**;
  - sekundárny „billed“ kľúč = projekt `gen-lang-client-0886364510` („neuro“), **billing zapnutý**, kľúč „Gemini API Key - May 26“.
  - Firebase projekt `neuro-b7a51` Gemini kľúč nemá.
- **OpenAI kľúč** je v Cloud Run nastavený, ale v UI sú GPT modely zakomentované (`frontend-v2/src/components/ticker/model-options.ts`) → OpenAI sa dnes nevolá z UI; `ensemble` cez API by ho zavolal.
- **Crony**: GitHub Actions `crons.yml` → HTTP endpointy s `X-Cron-Secret`: každých 5 min (24/7) digest + queue; každých 5 min v burze snapshoty (25 tickerov) + top picks + portfóliá; hodinovo candle sync (20), StockTwits, cleanup, **risk/reward scanner (3 tickery/hod, free-only, denný rozpočet 450 flash-lite volaní)**; denne moderácia komentárov (LLM), watchers, cleanup >90 dní.

### 2.2 Prevádzka za posledných 7 / 30 dní (RAN, Cloud Logging)
| Metrika | Hodnota | Zdroj |
|---|---|---|
| HTTP requesty / 7 dní | 7 515 (771–1 335 / deň) | RAN |
| z toho browser / curl (crony) / ostatné (boti, monitory) | 5 336 / 331 / 1 848 | RAN (User-Agent) |
| rôzne IP / 7 dní | 430 (vrátane crawlerov — `robots.txt` 136×, `sitemap.xml` 83×) | RAN |
| stavové kódy / 7 dní | 2xx 5 986 · 3xx 1 324 · 4xx 204 · 5xx 1 | RAN |
| Google prihlásenia (callback) / 30 dní | 46 (1–4 denne) | RAN |
| `POST /api/v1/research/ask` / 30 dní | **26** (všetky 201) | RAN |
| Gemini volaní / 30 dní | **856**: 579 `gemini-3.5-flash-lite` free · 200 `gemini-3.8-flash` free · 47 `3.1-flash-lite` · 15 `3.5-flash` · 6 gemma · **7 `gemini-4-argon` billed · 2 `3.1-pro-preview` billed** | RAN |
| Gemini volaní / deň (14.–20. 10.) | 77–111, z toho flash-lite 57–86, 3.8-flash 17–24 | RAN |
| Gemini 429 v logoch / 30 dní | **0** | RAN |
| prepnutia na sekundárny kľúč / 30 dní | 9 (všetko kvôli Argon/Pro, nie kvôli kvóte) | RAN |
| Finnhub „RATE LIMIT EXCEEDED“ / 30 dní | 12 (všetky 2026-10-16) | RAN |

**Záver §2:** Dnes platíš za LLM takmer nič (9 billed volaní/mesiac, rádovo < $2). Fixné náklady sú Cloud Run (pravdepodobne v rámci free tieru, INFERRED) + Neon (neznámy plán) + doména.

---

## 3. Cena jedného používateľa / jedného research behu

### 3.1 Čo jeden beh skutočne volá (READ `src/modules/research/research.service.ts:300-610`)
1. **Hlavný research** — model podľa tieru, **s Google Search groundingom**, Argon s `includeThoughts` (thinking tokeny sa účtujú ako output).
2. Enrichment paralelne (každý krok vlastné LLM volanie):
   - titulok — `scoring` tier (flash-lite, bez search), `maxTokens 50`;
   - quality scoring — `scoring` tier (flash-lite, bez search);
   - **risk/reward extrakcia — `medium` tier (= `gemini-3.8-flash`) a má zapnutý Google Search**, lebo `noSearch` platí len pre `extraction`/gemma/`summary|scoring|recommendation` (`gemini.provider.ts:76-85`) → **2 groundované volania na beh** namiesto 1; zbytočný náklad aj kvóta (návrh: `extraction` tier alebo explicitný `noSearch`);
   - finančná extrakcia — `extraction` tier (flash-lite, bez search).
3. Spolu **5 LLM volaní na beh** (budget scannera počíta s 2 — `RISK_SCANNER_CALLS_PER_TICKET = 2`, `jobs.service.ts:361`; meter v provideri počíta research + risk + financials = 3; titulok a scoring sa nemerajú).

### 3.2 Cenník (READ, oficiálne stránky, k 2026-10-21)
Gemini (ai.google.dev/gemini-api/docs/pricing, „Last updated 2026-10-19“), Standard tier, USD / 1M tokenov:
| Model | Free tier | Input | Output (vrátane thinking) |
|---|---|---|---|
| `gemini-3.5-flash-lite` | áno | 0,30 | 2,50 |
| `gemini-3.8-flash` | áno | 0,75 (od 1. 1. 2027: 1,50) | 3,75 (od 1. 1. 2027: 7,50) |
| `gemini-4-argon` | **nie** | 2,00 (od 1. 12. 2026: **4,00**) | 10,00 (od 1. 12. 2026: **20,00**) |
| `gemini-3.1-pro-preview` | nie | 2,00 / 4,00 (>200k) | 12,00 / 18,00 |
| Grounding with Google Search (Gemini 3+) | 5 000 requestov/mesiac zdarma, zdieľané | potom **$14 / 1 000** | |

OpenAI (developers.openai.com/api/docs/pricing, READ): `gpt-4.1-mini` 0,40 / 1,60; `gpt-5.1` 1,25 / 10,00; web search $10 / 1 000 volaní. Dnes z UI nevolané.

### 3.3 Odhad nákladu na beh na **platenom** kľúči (INFERRED tokeny, READ ceny)
Predpoklady: hlavný prompt 6 000 tokenov vstup (numerický kontext + otázka + požiadavky na dáta); výstup Lite 1 500, Flash 2 500, Argon 4 000 odpoveď + 8 000 thinking; enrichment: titulok 4 000/50, scoring 5 000/200, risk 7 000/700 (na 3.8-flash), financie 5 000/600.
| Beh | Hlavné volanie | Enrichment (4 volania) | **Spolu** |
|---|---|---|---|
| Flash Lite (1 kredit) | $0,006 | $0,014 | **≈ $0,02** |
| Flash (2 kredity v UI, 1 v `/ask`) | $0,014 | $0,014 | **≈ $0,03** |
| Argon (5 kreditov, len `pro`) do 30. 11. | $0,132 | $0,014 | **≈ $0,15** |
| Argon od 1. 12. 2026 | $0,264 | $0,014 | **≈ $0,28** |
| + grounding nad 5 000/mesiac | 2 volania × $0,014 | | **+ $0,028 / beh** |

Pozor: toto sú odhady. **Skutočné čísla:** `research_notes.tokens_in/tokens_out` + `models_used` sú v DB pre každý beh — SQL v prílohe B ti dá reálny priemer za 90 dní za 10 sekúnd v Neon konzole.

### 3.4 Ďalšie LLM výdaje mimo research behu (READ)
- Portfólio analýza (`POST /api/v1/portfolio/analyze`, `CreditGuard`, kredity podľa `getModelCost`), StockTwits sentiment (`POST /stocktwits/:symbol/analyze`, kredity), denný digest (free-only, budget-gated), moderácia komentárov (denne, flash-lite), scanner (3 tickery/hod, free-only). Všetko okrem Argon/Pro ide na free kľúč, kým free kvóta stačí.

---

## 4. Kvóty a limity

| Zdroj | Limit | Zdroj značky |
|---|---|---|
| Gemini free tier, `gemini-3.8-flash` | **≈ 20 requestov/deň** (fórum discuss.ai.google.dev, OP 2026-09-03; pozorované max. 24/UTC deň bez 429 — hranica dňa je pacifická, takže to nevyvracia) | READ web (fórum) + RAN |
| Gemini free tier, Flash-Lite | **≈ 500 requestov/deň na model** (kód `gemini.provider.ts:190-199`, fórum); app má strop 450/deň (`LLM_DAILY_FREE_LIMIT`) | READ kód + READ web |
| Gemini free tier RPM | 5–15 RPM podľa modelu (`GEMINI_MODELS.md` z 25. 1. 2026 uvádza 5 RPM pre flash, 10 pre flash-lite; scanner drží ~13 RPM) | READ (zastarané) |
| Gemini **paid** tier spend limit | Tier 1 **$10 / 10 min**, Tier 2 **$50 / 10 min** → teoretický strop $1 440 / $7 200 za deň, žiadny iný strop Google sám nedá | READ web (rate-limits) |
| Finnhub free | **60 volaní/min**, „personal use, US real-time only“, **nekomerčné**; prvý platený plán podľa agregátora $3 500/mes. (iné zdroje $50+) — **over na finnhub.io/pricing**, stránka je JS, nevedel som ju načítať | READ web (3. strana) |
| Yahoo Finance (`yahoo-finance2`) | neoficiálne API, bez zmluvy, bez SLA; blokovanie podľa IP/UA kedykoľvek (Cloud Run egress IP sa zdieľa) | INFERRED |
| Cloud Run | free tier 180 000 vCPU-s + 360 000 GiB-s + 2 M requestov/mesiac; potom ≈ $0,000018–0,000024 / vCPU-s (zdroje sa rozchádzajú), $0,0000025 / GiB-s, $0,40 / M requestov | READ web (čiastočne 3. strana) |
| Neon Free | 100 CU-hodín/mesiac/projekt, 1 GB; po vyčerpaní **compute sa pozastaví do konca mesiaca**; Launch $0,106 / CU-hod | READ web (neon.com/pricing) |
| App limity | 300 req/min/IP globálne; upload/contribute/stream 10/min; news-summary 20/min; `TICKER_CREATE_DAILY_LIMIT` 10 nových tickerov/deň/user; kvóty na watchlisty/pozície/alerty podľa tieru (`quota.service.ts`) | READ |

---

## 5. Čo sa pokazí pri verejnom traffic-u

### 5.1 Peniaze (INFERRED scenáre, ceny READ)
- **S1 — dnes:** < $2 / mesiac LLM. (RAN-konzistentné)
- **S2 — 100 aktívnych používateľov, 4 behy/mesiac (≈ 13/deň):** Lite aj Flash sa zmestia do free kvóty; platí sa len Argon (10 % behov → ≈ 40 × $0,15 = **$6/mes**). Infra: Cloud Run pravdepodobne stále free tier; Neon podľa plánu.
- **S3 — 1 000 používateľov, 4 behy/mesiac (≈ 133/deň):** Flash prekročí 20/deň → ~113 Flash behov/deň padá na platený kľúč = $3,4/deň = **$100/mes**; Argon 400 × $0,15 = $60; spolu **≈ $160–200/mes LLM**, od decembra ≈ $250. Cloud Run: SSE stream notifikácií (`/api/v1/notifications/stream`) drží inštanciu „v requeste“ → inštancia s 80 súbežnými SSE používateľmi stojí ≈ **$65/mes** (1 vCPU × 86 400 s × $0,000024 + pamäť); 100 súbežne prihlásených ≈ 2 inštancie ≈ $130/mes. Neon Launch ≈ $20–50.
- **S4 — zneužitie bez stropu:** platený kľúč nemá iný strop než Google spend limit ($10 alebo $50 / 10 min). Kredity to dnes ohraničujú na používateľa: free účet = 10 kreditov raz = max. 10 Flash behov ≈ $0,30 za celý život účtu; `pro` 50 kreditov = 10 Argon behov ≈ $1,50–2,80. **Vektor = masové zakladanie Google účtov** po otvorení registrácie: 10 000 fake účtov × $0,30 = $3 000. Preto musí byť strop aj „zhora“ (denný USD limit v appke + kvóty v Google konzole), nie len „zdola“ (kredity).

### 5.2 Limity (READ/INFERRED)
- Flash free kvóta ~20/deň je **zdieľaná medzi všetkými používateľmi aj scannerom** → pri otvorení ju vyčerpá prvých 20 behov a ostatné idú na platený kľúč (kód to robí automaticky pre ne-cron volania: `gemini.provider.ts:300-335`). To je dnes tichý prechod z „zadarmo“ na „platím“ — bez upozornenia.
- Finnhub 60/min: snapshot cron 25 tickerov × (profil + quote + financials) v jednom behu ≈ 75 volaní → 429 (12× dňa 16. 10.). Verejný traffic pridá refresh pri každom otvorení stale tickera (každých 15 min/ticker). Finnhub odmieta ne-US tickery → Yahoo.
- Yahoo: pri raste bude blokovať; všetko ne-US stojí na ňom.
- Cloud Run request timeout 300 s + scanner beží vnútri requestu (`--max-time 290`).
- Neon Free by pri 5-minútových cronoch 24/7 nikdy nezaspal a 100 CU-hod by sa minulo za ~17 dní → **ak si na Free, suspend uprostred mesiaca**; keďže app beží od decembra 2025, pravdepodobne si na Launch (INFERRED) — over.
- Latencia USA ↔ Frankfurt na každý DB dotaz.

### 5.3 Zneužitie (READ)
- Registrácia: dnes nemožná bez schválenia → po otvorení treba limit nových účtov/deň a limit behov/deň/user (dnes len kredity).
- Verejné trasy sú obmedzené na sledované tickery; `proxy/image` je správne zúžený na `finnhub.io` a bez redirectov; CSP a helmet sú zapnuté; cookies HttpOnly/secure/lax; JWT nie v URL; prompt-injection obrana v research prompte.
- **BYO kľúč:** ak si používateľ uloží vlastný Gemini kľúč, Argon aj tak **prepne na tvoj sekundárny (platený) kľúč** (`gemini.provider.ts:204-222`: gating sa vyhodnotí bez ohľadu na `prompt.apiKey`), a pri 429 na jeho kľúči tiež. Používateľ „platí svojím kľúčom“, ale platíš ty.
- **USER_SECRETS_KEYS nie je v Cloud Run env** → osobné Gemini kľúče používateľov sú v `users.preferences` v čistom texte (READ `.env.example`, RAN env).
- Kredity: `/research/ask` účtuje Flash 1 kredit (`getResearchCost`), UI aj portfólio tvrdia 2 (`getModelCost`) — nekonzistentné, dnes v tvoj neprospech.
- Kontribúcie (upload vlastného researchu za kredity) majú denný anti-farming strop a dedup hashom — v poriadku.

---

## 6. Bezpečnostné a prevádzkové nálezy

### P0 — pred čímkoľvek verejným
| # | Nález | Dôkaz | Čo s tým |
|---|---|---|---|
| P0-1 | **Privátny kľúč SA `firebase-adminsdk-fbsvc@neuro-b7a51` je čitateľný v Cloud Run konfigurácii** (JSON rozsekaný na čiarkach do názvov env premenných; `GCP_SA_KEY` má hodnotu `{`). Aplikácia loguje „serviceAccountJson is not valid JSON or Base64“ a ide cez ADC (funguje). Kľúč prešiel aj výstupom môjho nástroja. | RAN `gcloud run services describe`; RAN logy 21. 10.; READ `firebase.service.ts:27-50` | 1) vytvoriť nový SA kľúč alebo kľúč úplne zrušiť a nechať **ADC** (Firebase Admin na Cloud Run ho nepotrebuje); 2) `GCP_SA_KEY` z Cloud Run env odstrániť; 3) ak ostáva v CI, do Secret Managera (`--set-secrets`), nie `env_vars`; 4) starý kľúč **zmazať** v IAM. |
| P0-2 | **Neon prihlasovacie údaje v histórii PUBLIC repa**: prod (`ep-red-sun-…`) v `scripts/compare-schemas.ts` a `scripts/fix-prod-schema.js`, dev (`ep-quiet-fire-…`) tam isto, starší prod (`ep-fancy-paper-…`) v `check-prod-tables.js` a `scripts/history-test.log`. Dev a prod zdieľali v tom čase **rovnaké heslo**. Heslo v histórii ≠ dnešné (SHA-256 porovnanie, RAN). Trufflehog „verified“: 0. | RAN `git grep` cez 713 revízií; RAN hash porovnanie | V Neon konzole resetovať heslo role `neondb_owner` na **oboch** branchoch (prod aj dev), potom aktualizovať `DATABASE_URL` v GitHub secrets (repo + env `prod`) a redeploy. História sa z PUBLIC repa reálne nedá „odvolať“ (forky 0, ale GitHub cache a scrapery) — rotácia je jediná skutočná náprava. |
| P0-3 | **`RESEARCH_SHARE_SECRET` prázdny v prode** → `getShareLink` 500, verejné `/report/:id/:sig` nefunguje. | RAN env; READ `research.service.ts:1923-1933`; `gh secret list` bez tohto mena | pridať secret (48 B base64url) do env `prod`, redeploy. |
| P0-4 | **Platený Gemini kľúč nemá žiadny strop okrem Google $10–50/10 min.** | READ web + READ kód (žiadny USD limit) | denný USD strop v appke + budget alerty + kvóty v Google Cloud Console projektu „neuro“ (§8.5). |

### P1 — pred otvorením registrácie
| # | Nález | Dôkaz | Čo s tým |
|---|---|---|---|
| P1-1 | Dva deploy kanály na jeden push (Actions + Cloud Build) → dvojité build minúty, pretekanie env, nejasné „čo je nasadené“. | RAN | nechať **jeden**: odporúčam GitHub Actions (máš tam secrets aj crony), Cloud Build trigger vypnúť; alebo opačne — ale jeden. |
| P1-2 | `main` bez branch protection; secret scanning **push protection vypnutá**. | RAN `gh api` | zapnúť oboje (push protection je zadarmo pri public repe). |
| P1-3 | BYO kľúč padá na tvoj platený kľúč (Argon, 429). | READ `gemini.provider.ts:204-222, 320-335` | ak `prompt.apiKey` je používateľov: nikdy neprepínať na `secondaryApiKey`; Argon povoliť na jeho kľúči (billing je jeho). |
| P1-4 | `USER_SECRETS_KEYS` nie je nastavené → osobné kľúče v čistom texte v DB. | RAN env | nastaviť (`openssl rand -base64 32`), app ich pri štarte zašifruje sama (READ `.env.example`). |
| P1-5 | Mesačný reset kreditov neexistuje (`checkAndResetCredits` je placeholder). | READ `credit.service.ts:372-379` | cron (denný, idempotentný podľa `credits_reset_at`). |
| P1-6 | Cena Flash: 1 kredit v `/ask`, 2 v UI a portfóliu. | READ `credit.service.ts:17-56` | zjednotiť na `getModelCost` alebo na jednu tabuľku cien. |
| P1-7 | Risk extrakcia s Google Search (2 groundované volania/beh). | READ `gemini.provider.ts:76-85`, `risk-reward.service.ts:666-672` | `quality: 'extraction'` alebo `noSearch: true`. |
| P1-8 | Právny kontakt `LEGAL_CONTACT_EMAIL = 'granger4783@gmail.com'` s poznámkou „confirm this address“; dátum účinnosti 2026-01-26. | READ `LegalPage.tsx:17-20` | doplniť tvoj kontakt alebo doménový alias. |
| P1-9 | Finnhub free plán = nekomerčné použitie (3. strana). Pri spoplatnení treba platený plán alebo iný provider. | READ web (3. strana) | overiť na finnhub.io/pricing; rozhodnutie tvoje. |
| P1-10 | Cloud Run v `us-central1`, DB v `eu-central-1`; používatelia v EÚ. | RAN | zvážiť `europe-west3/4` (rovnaký cenový tier) — latencia aj GDPR „data location“ argument. |

### P2 — hygiena
- `.tmp-design/` (8,2 MB, `design.tar.gz`, `chats/chat1.md` — prepis chatu) a `.claude/settings.local.json` (cesty na tvojom Macu) sú tracked v PUBLIC repe. `.agent/`, `.antigravitycli/` tiež. (RAN `git ls-files`)
- `SECURITY.md` je GitHub šablóna s nevyplnenými vetami („Use this section to tell people…“). (READ)
- `GEMINI_MODELS.md` (25. 1. 2026) a `docs/architecture/models.yml` nezodpovedajú dnešným modelom. (READ)
- `DEFAULT_ADMINS` sú hardcoded emaily dvoch ľudí v public kóde (`users.service.ts:27`). Funkčne OK, ale identita admina je verejná.
- Lokálny `.env` má v `GEMINI_API_KEY` 45-znakovú hodnotu napriek komentáru „intentionally empty“ (RAN dĺžka; hodnotu som nečítal). `.env` nie je a nikdy nebol tracked (RAN).
- `deploy.yml` krok „Debug Secrets“ je neškodný (len booleany). Actions maskujú secrets v logoch; Cloud Build logy som nekontroloval.
- Stream endpoint `POST /research/stream` používa agenta `deep-research-pro-preview-12-2025` na **primárnom** kľúči (`research.service.ts:90`); frontend-v2 ho nevolá (grep). Cena/fungovanie neoverené — kandidát na vypnutie.

---

## 7. Čo už hrá v tvoj prospech (READ)
- Kreditová ekonomika s atomickým odpočtom pred behom, refund pri `LLM_UNAVAILABLE`, anti-farming.
- `pro` gate na Argon, `whale`/`pro` kvóty na zdroje.
- Denný rozpočet free volaní v DB (`llm_daily_usage`), free-only režim pre crony, scanner 3/hod.
- Systémový research každého tickera ~raz týždenne zadarmo (scanner) → **zdieľaná cache per ticker už existuje**; research notes sú viditeľné všetkým používateľom.
- BYO kľúč už implementovaný (vrátane šifrovania, keď sa zapne).
- Terms (s finančným disclaimerom), Privacy, About, disclaimer v Dashboarde a vo verejnom reporte; cookie len autentifikačná (strictly necessary → bez cookie bannera).
- Helmet/CSP, trust proxy, throttler, validácia DTO, `toJSON` guard na User, prompt-injection obal.

---

## 8. Odporúčaný model financovania (rozhodnutie, nie prehľad)

**Rozhodnutie:** *Free tier s tvrdým mesačným limitom + predplatené balíky kreditov cez Merchant-of-Record bránu + BYO kľúč za 0 kreditov + zdieľaný systémový research ako default + waitlist ako klapka + denný USD strop v kóde.* Bez predplatného na začiatku: pri < 100 platiacich má predplatné najhorší pomer právnej/účtovnej práce k výnosu, balík kreditov je jednorazový predaj digitálneho tovaru a MoR brána rieši DPH v EÚ za teba.

### 8.1 Free tier
- **5 kreditov / mesiac** (reset 1. dňa), Lite = 1, Flash = 2, Argon zamknutý.
- Strop nákladu na free používateľa: 5 × $0,02 = **$0,10 / mesiac** (Lite) alebo 2 Flash + 1 Lite ≈ $0,08. **1 000 free používateľov ≤ $100 / mesiac** aj v najhoršom prípade; pri 30 % aktivite ≈ $30. (INFERRED z §3.3)
- Default UX pre free: **čítaj systémový research** (zadarmo, týždenný) + 5 vlastných behov. „Čerstvý research < 24 h rovnakého tieru existuje → ponúkni ho namiesto nového behu“ (nová logika) — odhadom ušetrí 30–50 % behov (INFERRED).

### 8.2 Platené kredity (jednorazové balíky)
- **100 kreditov = 9 €** (0,09 €/kredit) · **300 kreditov = 24 €** (0,08 €/kredit).
- Ceny behov v kreditoch: Lite 1 (0,09 € vs náklad $0,02), Flash 2 (0,18 € vs $0,03), **Argon 10** (0,90 € vs $0,15–0,28). Marža na každom behu > 3× aj po decembrovom zdražení Argonu.
- Platená transakcia nastaví `tier = 'pro'` (odomkne Argon) na 12 mesiacov od poslednej platby.
- Brána: **Paddle alebo Lemon Squeezy (Merchant of Record)** — oni sú predajcom, riešia DPH/OSS, faktúry a chargebacky; Stripe by znamenal vlastnú DPH registráciu pre B2C v EÚ. Výber medzi tými dvoma je tvoj; implementačne sú rovnaké (webhook → `addCredits(reason='purchase')`).
- Break-even: fixné náklady ≈ $30–60/mes (Neon Launch ≈ $20, Cloud Run $0–20, doména, Finnhub ak platený viac) → **10 balíkov/mesiac pokryje fix**.

### 8.3 BYO kľúč = 0 kreditov
- Beh s používateľovým Gemini kľúčom nestojí kredity a je povolený aj Argon (platí si ho sám).
- Nikdy fallback na tvoj platený kľúč (P1-3). Kľúče šifrované (P1-4).
- Toto je aj „power-user“ cesta namiesto predplatného: neobmedzené behy za vlastné peniaze.

### 8.4 Zdieľaná cache per ticker
- Systémový scanner zostáva (free-only, 3/hod). Pridať „fresh existing research“ ponuku pred novým behom a zobrazovať cenu v kreditoch pred potvrdením (dnes je).

### 8.5 Tvrdý strop výdavkov (všetky tri vrstvy)
1. **V appke:** denný USD strop na platený kľúč (odhad ceny podľa modelu × tokeny z `usageMetadata`, DB-backed ako `llm_daily_usage`), default **$5/deň**; po prekročení `LLM_UNAVAILABLE` (503) + existujúci refund kreditov. Admin vidí stav v `/admin`.
2. **V Google Cloud:** budget alerty na billing účte ($10 / $25 / $50 mesačne, e-mail) — alerty nič nezastavia, len informujú.
3. **Kvóty API v konzole** projektu `gen-lang-client-0886364510` („neuro“): znížiť *requests per day* pre `gemini-4-argon` a `gemini-3.8-flash` na hodnotu, ktorú si ochotný zaplatiť (napr. 200/deň) — toto je **jediný skutočný „hard stop“ zo strany Google**.

### 8.6 Waitlist ako klapka
- `SIGNUP_MODE = invite | waitlist | open` + `SIGNUP_DAILY_CAP` (napr. 25 nových účtov/deň; nad limit → waitlist). Otvoriť = prepnúť env, zavrieť = prepnúť späť, bez deployu kódu.
- Per-user denný strop behov (napr. 10/deň aj pre `pro`) proti script-abuse.

---

### 8B. Alternatíva: non-profit + dobrovoľné príspevky (tvoj návrh, 21. 10. večer)

**Čo zjednoduší.** Žiadna platobná brána, DPH ani OSS registrácia, žiadne refundy a spotrebiteľské právo, žiadne „kredity za peniaze“. Dar prijatý fyzickou osobou mimo podnikania spravidla nie je predmetom dane z príjmov (§ 3 ods. 2 zákona o dani z príjmov) — **over s účtovníkom, nie som daňový poradca** (INFERRED).

**Čo nezmení.**
1. *Náklady rastú s používateľmi, príspevky nie.* Stropy z §8.1 (5 kreditov/mesiac), §8.5 (denný USD strop, kvóty v konzole) a BYO kľúč (§8.3) ostávajú podmienkou, inak tip jar prehrá s prvým virálnym dňom.
2. *Licencia dát sa netýka peňazí, ale zdieľania.* Finnhub Terms of Service (READ 2026-10-21, finnhub.io/terms-of-service): všetky plány na webe sú „strictly for personal use unless explicitly stated otherwise“; zákaz „redistribute or share access to data or derived results“; zdieľanie s kýmkoľvek, aj tretími stranami, vyžaduje „written approval from Finnhub“. Verejný web, ktorý zobrazuje ceny, fundamenty a správy iným ľuďom, je zdieľanie derivátov s tretími stranami — **aj zadarmo, aj ako non-profit**. Formálna nezisková organizácia (o.z., n.o.) to zhorší, nie zlepší: „Personal plan can't be used by any business even internally without a written approval“ — právnická osoba nie je „personal“.
3. *Yahoo Finance* nemá žiadnu licenciu na API; `yahoo-finance2` je neoficiálny klient, ktorý číta to, čo číta prehliadač. Non-profit status na tom nič nemení; riziko je právne aj prevádzkové (blokovanie). (INFERRED o riziku, READ o povahe knižnice.)
4. *Gemini free tier:* podľa podmienok Gemini API môže Google obsah z bezplatných služieb použiť na zlepšovanie produktov — overiť v „Gemini API Additional Terms“ (INFERRED z pamäte). Pre Privacy policy to znamená vetu, že otázky a tickery idú do Google; pre používateľov s vlastným kľúčom platia ich podmienky.

**Odporúčanie, ak ideš touto cestou.**
- Ostať fyzická osoba s hobby projektom; nezakladať právnickú osobu kvôli príspevkom.
- **Napísať Finnhubu** (support@finnhub.io) a vypýtať si písomný súhlas: bezplatný nekomerčný projekt jedného autora, podporovaný dobrovoľnými príspevkami bez protihodnoty, dáta zobrazené registrovaným používateľom, atribúcia „Data provided by Finnhub“, žiadny export/API pre tretích. Odpoveď odložiť k dokumentom. Bez súhlasu je verejný launch na Finnhube v rozpore s podmienkami aj bez jediného eura; so súhlasom je to najlacnejšia cesta (0 €). Ak odmietnu, §11.
- Tip jar: **GitHub Sponsors** (projekt je open source na GitHube; pre jednotlivcov bez poplatku platformy) + Buy Me a Coffee alebo Ko-fi pre ľudí mimo GitHubu (BMAC 5 %, Ko-fi 0 % + poplatok karty). Za príspevok **žiadne kredity ani funkcie** — inak je to predaj (spotrebiteľské právo, DPH, Finnhub „business“). Nanajvýš odznak „Supporter“ v profile.
- Čísla: fixné náklady ≈ €30–60/mes (Neon ~6 € podľa teba, doména, Cloud Run 0–20 $, Gemini billed 0–10 $ pri stropoch). Tip jar pri pár sto používateľoch typicky nízke jednotky €/mes (INFERRED, bez dát). Model teda funguje len so stropmi; power-useri idú cez BYO kľúč.

Rozhodnutie medzi §8 (kredity) a §8B (príspevky) je tvoje; technické kroky Fázy 0 a Fázy 1 sú pre oba rovnaké.

---

## 9. Plán otvorenia

### Fáza 0 — bezpečnostná hygiena (pred čímkoľvek, ~1 večer; rozhoduješ ty, skripty pripravím)
1. P0-1: nový SA kľúč alebo ADC-only; `GCP_SA_KEY` preč z Cloud Run env; starý kľúč zmazať.
2. P0-2: reset hesiel Neon rolí (prod + dev) → GitHub secrets → redeploy.
3. P0-3: `RESEARCH_SHARE_SECRET` do env `prod`.
4. P1-1: jeden deploy kanál. P1-2: branch protection + push protection.
5. Rozhodnutie o viditeľnosti repa (§10 ot. 1). Ak ostáva PUBLIC: odstrániť `.tmp-design/`, `.claude/settings.local.json`, `.antigravitycli/`, vyplniť `SECURITY.md`.
6. Prečítať skutočné účty za september/október (Cloud Billing konzola, Neon konzola) — ja ich nevidím.

### Fáza 1 — stropy a limity (kód; 1–2 dni)
7. Denný USD strop na platený kľúč (§8.5.1) + admin náhľad.
8. BYO kľúč bez fallbacku na platený kľúč (P1-3); `USER_SECRETS_KEYS` (P1-4).
9. Mesačný reset kreditov (P1-5); zjednotenie cien (P1-6); risk extrakcia bez search (P1-7).
10. `SIGNUP_MODE` + `SIGNUP_DAILY_CAP` + per-user denný strop behov.
11. Snapshot cron pod 60/min (menšie dávky alebo pauza) — Finnhub 429 z 16. 10.
12. Google budget alerty + kvóty API v konzole (ruky: ty, kroky dodám).

### Fáza 2 — právne (text; rozhoduješ ty)
13. Terms: kredity (nevratné, bez peňažnej hodnoty), prijateľné použitie, 18+, „nie je investičné poradenstvo“ (už je), zdroje dát a ich licencie, ukončenie účtu, rozhodné právo (SR).
14. Privacy (GDPR): identita prevádzkovateľa, právny základ, doba uchovávania, zoznam spracovateľov (Google Cloud US — DPF, Neon EU, Google OAuth, Paddle/LS), právo na výmaz → **endpoint „zmazať účet“ chýba** (READ: nie je v `users.controller.ts`), kontakt (P1-8).
15. Disclaimer banner na stránke research výsledkov (dnes len Dashboard/Public report) — jedna veta.
16. Finnhub licencia (P1-9): platený plán, alebo prepnúť zdroj.

### Fáza 3 — monitoring (pol dňa)
17. Log-based metriky + alerty v Cloud Monitoring: „SECONDARY API KEY“, „FINNHUB RATE LIMIT“, 5xx > N/h, `LLM_UNAVAILABLE`.
18. Uptime check na `/api/v1/health`.
19. Denný e-mail/Slack súhrn: behy, billed volania, odhadnutý USD, noví používatelia.

### Fáza 4 — otvorenie
20. `SIGNUP_MODE=waitlist` s auto-approve capom → sledovať týždeň → `open`.
21. Platby (Paddle/LS) môžu prísť **až po** otvorení — free + BYO + waitlist je životaschopný minimálny launch.
22. LinkedIn až keď je `open` stabilné týždeň.

---

## 10. Rozhodnutia (21. 10. večer) a otvorené body
1. **Repo PUBLIC — áno, zámer.** → rotácia SA kľúča a hygiena P2 sú povinné; pripravené v §12.
2. **Neon — platený plán, ~6 €/mes** (podľa teba). → riziko suspendu free plánu odpadá. Faktúra Google Cloud za september ostáva neprečítaná.
3. **Finnhub aj Yahoo — problém, súhlasíš.** → §8B bod 2–3 a §11. Prvý krok: list Finnhubu (0 €).
4. **Platby — „nejaké áno“**, s alternatívou non-profit + dobrovoľné príspevky (§8B). Rozhodnutie otvorené; Fáza 0 a 1 sú pre oba modely rovnaké.
5. **Neon heslo:** prod zmenené — overené porovnaním SHA-256 hesla v histórii a v Cloud Run (líšia sa). Dev branch (`ep-quiet-fire-…`) a starý endpoint (`ep-fancy-paper-…`) neoverené → `scripts/launch/03-neon-passwords.md`. SA kľúč: rotácia pripravená (`01-delete-leaked-sa-key.sh`), spúšťaš ty.
6. **Región Cloud Run — „asi áno“.** → §12.3; nie je súčasť Fázy 0.

Ostáva na teba: právny kontakt na stránkach Privacy/Terms (`LEGAL_CONTACT_EMAIL`, dnes cudzí gmail) — navrhujem branislavlang@gmail.com, rovnaký ako v SECURITY.md a OWNERS.md.

---

## 11. Licencie trhových dát (READ web, 2026-10-21)

| Provider | Čo som prečítal | Pre nás |
|---|---|---|
| **Finnhub** (terms-of-service) | všetky plány „strictly for personal use“; „not redistribute or share access to data or derived results“; zdieľanie s tretími stranami len s „written approval“; „Personal plan can't be used by any business even internally“ | dnešný stav je v rozpore s podmienkami, aj bez peňazí → písomný súhlas alebo odchod. Cenník (finnhub.io/pricing) je JS, nenačítal som ho; agregátor uvádza free 60 volaní/min a All-In-One $3 500/mes — treba sa opýtať priamo. |
| **Massive** (bývalý Polygon.io, massive.com/pricing) | Stocks Starter $29/mes (15-min delayed, neobmedzené volania), Developer $79, Advanced $199 real-time + Financials; Financials & Ratios samostatne $29; správy (Benzinga) $99/dataset; všetko označené „Individual use“, redistribúcia na stránke neriešená | cenovo najbližšie; podmienky zobrazovania cudzím používateľom treba potvrdiť so sales |
| **EODHD** (eodhd.com/pricing) | tab „Personal use“: All-In-One €99,99/mes (100 000 volaní/deň, 1 000/min, fundamenty + 15-min/live + správy), Fundamentals €59,99 bez kurzov; tab „Commercial / B2B“ na dopyt | EÚ firma, EUR; komerčná cena neznáma |
| **Twelve Data** (twelvedata.com/pricing) | Grow $79/mes „Internal display data access“, Pro $229; komerčné plány na `pricing-business` | personal plány explicitne len interné |
| **Alpha Vantage** (alphavantage.co/premium) | premium od $49,99/mes (75 req/min), free 25 req/deň; redistribúcia na stránke neriešená | kvóty slabé pre crony |
| **Yahoo Finance** | žiadne API podmienky, `yahoo-finance2` je neoficiálny klient | bez licencie; náhrada = ktorýkoľvek z riadkov vyššie (všetci dávajú aj ne-US tickery v platených plánoch) |

**Záver:** pre zobrazovanie dát cudzím ľuďom chce každý provider „commercial/business“ plán alebo písomný súhlas; realistická cena za kurzy + fundamenty + správy s licenciou je ≈ €100–200/mes (INFERRED z personal cenníkov; business ceny neznáme). Poradie: (1) list Finnhubu, (2) ak nie, dopyt na Massive a EODHD s konkrétnou otázkou „display to registered users of a free/non-profit web app, ~N users, attribution“, (3) prepnúť `MarketDataService` zdroj — abstrakcia Finnhub → Yahoo fallback už existuje, tretí provider sa pridá do rovnakého miesta.

---

## 12. Pripravený balík Fázy 0 (21. 10. večer)

### 12.1 Súbory v repe (necommitnuté, commit robíš ty)
- `.github/workflows/deploy.yml` — len `workflow_dispatch`, bez `env_vars` a bez `GCP_SA_KEY`; deploy robí Cloud Build trigger (buildí `Dockerfile`, `gcloud run services update --image`, runtime SA, bez kľúča — READ `gcloud builds triggers describe`).
- `.gitignore` — `.tmp-design/`, `.antigravitycli/`, `.claude/settings.local.json`.
- `SECURITY.md` — skutočná politika namiesto šablóny.
- `scripts/launch/README.md` — poradie krokov a overenie.
- `scripts/launch/00-cloudrun-fix-env.sh` — odstráni `GCP_SA_KEY`, `APP_PORT` a rozsekaný JSON z env (len názvy, hodnoty nečíta), nastaví `APP_ENV=prod`.
- `scripts/launch/04-secrets.md` — dva príkazy: `RESEARCH_SHARE_SECRET`, `USER_SECRETS_KEYS` (hodnoty sa generujú lokálne a idú priamo do Cloud Run).
- `scripts/launch/01-delete-leaked-sa-key.sh` — zmaže kľúč `c3223066…` (naposledy použitý 2026-10-16 = GitHub deploy; RAN Policy Analyzer) a GitHub secret `GCP_SA_KEY`; `--also-stale` zmaže aj `ec7673f0…` (naposledy použitý 2026-03-13).
- `scripts/launch/02-github-protections.sh` — push protection ON, branch protection `main` (bez force-push/zmazania; bez povinných review).
- `scripts/launch/03-neon-passwords.md` — čo resetovať v Neon konzole a ako potom bezpečne vymeniť `DATABASE_URL`.

### 12.2 Commit skript (mimo repa)
`~/Documents/ESS-MAIN/COMMIT_neural-ticker-phase0_2026-10-21.sh` — branch `chore/launch-phase0` z `origin/main`, `git rm --cached` hygiena, explicitný zoznam súborov, `diff --cached --stat`, [y/N], commit, push, PR. Merge do `main` spustí Cloud Build deploy.

### 12.3 Presun regiónu (Fáza 2+, po stabilizácii)
- DNS `neuralticker.com` → A `216.239.32.21`, hlavička `server: Google Frontend`: to je **Cloud Run domain mapping** (INFERRED z IP rozsahu `216.239.32/34/36/38.21`, ktorý Cloud Run mapping používa; `gcloud run domain-mappings list` v mojej verzii gcloud nefungoval bez `beta` komponentu).
- Domain mappings sú podporované len v časti regiónov; v Európe `europe-west1` (Belgicko) a `europe-west4` (Holandsko), Frankfurt `europe-west3` podľa mojej pamäte **nie** (INFERRED — overiť v dokumentácii „Mapping custom domains“ pred krokom). Belgicko ↔ Frankfurt ≈ 10 ms, pre DB latenciu zanedbateľné.
- Postup: nová služba `neural-ticker-core` v `europe-west1` s rovnakým image a env (export env z us-central1 → import; hodnoty neprechádzajú cez git), Cloud Build trigger `_DEPLOY_REGION` + Artifact Registry repo v novom regióne, GitHub variable `CLOUD_RUN_URL` (crony) na nový URL, presun domain mappingu (minúty výpadku, DNS A záznamy ostávajú tie isté), zmazanie starej služby po týždni.

---

## Príloha A — čo som spustil (RAN), aby sa to dalo zopakovať
```bash
gh repo view 404-Profit-Not-Found/neural-ticker-core --json visibility,isPrivate,defaultBranchRef,pushedAt,licenseInfo
gh api repos/404-Profit-Not-Found/neural-ticker-core --jq '.security_and_analysis'
gh api repos/404-Profit-Not-Found/neural-ticker-core/branches/main/protection
gh secret list --repo 404-Profit-Not-Found/neural-ticker-core; gh secret list --env prod
gh variable list --repo 404-Profit-Not-Found/neural-ticker-core --env prod
gh run list --workflow deploy.yml|crons.yml|ci.yml --limit 3
gcloud run services describe neural-ticker-core --region us-central1 --project neuro-b7a51 --format=yaml
gcloud builds triggers list --project neuro-b7a51; gcloud builds list --limit 5
gcloud billing projects describe neuro-b7a51 | gen-lang-client-0783334320 | gen-lang-client-0886364510
gcloud services api-keys list --project <každý z troch>
gcloud logging read '… "Gemini Request" …' --freshness=30d   # 856 riadkov, agregované podľa modelu a kľúča
gcloud logging read '… httpRequest.requestUrl:"/api/v1/research/ask" …' --freshness=30d
gcloud logging read '… logName:"requests" …' --freshness=7d   # 7 515 riadkov
trufflehog git file:///…/neural-ticket-core --only-verified   # verified 0, unverified 0
git grep -E '<vzory kľúčov a postgres://user:pass@>' $(git rev-list --all)   # 713 revízií, 3 008 zásahov, 12 súborov
```
Hodnoty tajomstiev som maskoval alebo porovnával len cez SHA-256; žiadnu som nevypísal do súboru.

## Príloha B — skutočné náklady z DB (spusti v Neon konzole, read-only)
```sql
-- priemerné tokeny a odhad USD na beh podľa modelu, posledných 90 dní
WITH p AS (
  SELECT * FROM (VALUES
    ('gemini-3.5-flash-lite', 0.30, 2.50),
    ('gemini-3.8-flash',      0.75, 3.75),
    ('gemini-4-argon',        2.00, 10.00),
    ('gemini-3.1-pro-preview',2.00, 12.00)
  ) AS t(model, in_per_m, out_per_m)
)
SELECT n.models_used[1]                         AS model,
       n.quality,
       count(*)                                  AS runs,
       round(avg(n.tokens_in))                   AS avg_in,
       round(avg(n.tokens_out))                  AS avg_out,
       round(avg(n.tokens_in * p.in_per_m + n.tokens_out * p.out_per_m) / 1e6, 4) AS avg_usd_main_call
FROM research_notes n
LEFT JOIN p ON p.model = n.models_used[1]
WHERE n.created_at > now() - interval '90 days'
  AND n.status = 'completed'
GROUP BY 1, 2
ORDER BY runs DESC;

-- koľko behov bolo používateľských vs systémových (scanner) za 30 dní
SELECT (user_id IS NULL) AS system_run, quality, count(*)
FROM research_notes
WHERE created_at > now() - interval '30 days'
GROUP BY 1, 2 ORDER BY 1, 2;

-- free kvóta: denné flash-lite volania podľa app metra
SELECT usage_date, count FROM llm_daily_usage ORDER BY usage_date DESC LIMIT 30;
```
Poznámka: `tokens_in/out` sú len z hlavného volania; enrichment (4 volania) sa neukladá — pripočítaj ≈ $0,014/beh podľa §3.3, alebo pridaj logovanie.
