# Security Policy

Neural-Ticker is a single-maintainer project. The code in this repository runs
at <https://neuralticker.com>.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Email
**branislavlang@gmail.com** with:

- what you found and where (URL, endpoint, file and line),
- how to reproduce it,
- what impact you believe it has.

You will get an acknowledgement within 72 hours and a status update when the
issue is fixed or declined. Credit in the fix commit is given if you want it.
There is no bug bounty.

## Scope

- This repository (backend `src/`, web clients `frontend-v2/` and `frontend/`,
  workflows in `.github/`).
- The deployed service at neuralticker.com and its API under `/api`.

Out of scope: third-party data providers and LLM APIs the service calls, and
denial-of-service testing against the live service.

## Supported versions

Only the `main` branch is supported; it is deployed continuously. Older tags
and branches receive no fixes.

## Secrets

No real secret belongs in this repository. Configuration comes from the
environment (see `.env.example`); `.env` is git-ignored. If you find a secret in
the git history, report it the same way as a vulnerability so it can be
rotated.
