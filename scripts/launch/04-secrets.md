# Fáza 0 / krok 2b — dve chýbajúce tajomstvá služby (ručne, dva príkazy)

Stav 2026-10-21 (RAN `gcloud run services describe`): `RESEARCH_SHARE_SECRET` je v Cloud Run
prázdny (share linky na research vracajú 500, `research.service.ts:1923-1933`) a
`USER_SECRETS_KEYS` chýba (osobné Gemini kľúče používateľov sú v DB v čistom texte,
`.env.example` → sekcia "Users' personal API keys").

Oba príkazy vygenerujú hodnotu lokálne a pošlú ju priamo do Cloud Run env; nič sa nevypisuje
na terminál. Vznikne jedna nová revízia. `^|^` je vlastný oddeľovač pre gcloud (hodnoty
obsahujú `=` a `:`).

```bash
gcloud run services update neural-ticker-core --region us-central1 --project neuro-b7a51 --quiet \
  --update-env-vars "^|^RESEARCH_SHARE_SECRET=$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n')|USER_SECRETS_KEYS=k1:$(openssl rand -base64 32 | tr -d '\n')"
```

Potom over (názvy aj to, že app pri štarte zahlásila šifrovanie kľúčov):

```bash
gcloud run services describe neural-ticker-core --region us-central1 --project neuro-b7a51 --format='value(spec.template.spec.containers[0].env[].name)' | tr ';' '\n' | grep -E 'RESEARCH_SHARE_SECRET|USER_SECRETS_KEYS'
```

```bash
gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=neural-ticker-core AND (textPayload:"SecretBox" OR textPayload:"re-encrypted" OR textPayload:"encrypted")' --project neuro-b7a51 --freshness=15m --limit=5 --format='value(timestamp,textPayload)'
```

## Záloha `USER_SECRETS_KEYS` (dôležité)
Bez tohto kľúča sú zašifrované osobné kľúče používateľov nečitateľné (app ich potom ignoruje
a používateľ si musí kľúč uložiť znova). Ulož si hodnotu z Cloud Run do svojho správcu hesiel
(1Password) — prečítaš ju v Cloud Run konzole → služba → Revisions → Variables & secrets.
Do GitHubu ju dávať netreba: deploy workflow už env nenastavuje (pozri README.md).

## Prečo nie Secret Manager hneď
Dá sa (`--set-secrets`), ale vyžaduje IAM na runtime servisnom účte a zmenu v Dockerfile/kóde
nie je nutná — je to krok navyše bez bezpečnostného zisku oproti env, kým je env čistý.
Zapísané ako P2 na neskôr.
