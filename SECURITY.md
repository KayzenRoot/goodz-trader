# Security Policy

## Reporting

Please **do not** open a public issue for a vulnerability. Use GitHub's private
vulnerability reporting:

<https://github.com/KayzenRoot/goodz-trader/security/advisories/new>

Include reproduction steps, affected commit, impact and any suggested fix. We aim to
acknowledge within 72 hours. Rotate any exposed MEXC key immediately; this project cannot
revoke exchange credentials for you.

## Supported versions

Only the latest commit on `main` is supported during the 0.x line. There are no LTS
branches yet.

## Threat model (summary)

| Asset            | Risk                               | Control                                                                        |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| MEXC API secret  | exfiltration via logs, DB, browser | AES-256-GCM at rest, masked responses, redacted logs, no client-side secret    |
| Dashboard access | unauthorized order control         | optional password, signed HttpOnly SameSite=Strict session, rate-limited login |
| Order flow       | accidental live trading            | server flag + typed phrase + kill switch + paper default                       |
| Ledger           | tampering/loss                     | SQLite WAL, parameterized SQL, append-only audit, backups                      |
| Supply chain     | malicious dependency               | lockfile, Dependabot, dependency review, CodeQL, Semgrep, Gitleaks, Scorecard  |
| Host             | network exposure                   | bind 127.0.0.1 by default; reverse proxy/TLS + auth if remote                  |

## Hardening checklist

- Set `APP_SECRET` to 32+ random characters. Never reuse the dev secret.
- Set `AUTH_PASSWORD`. Put the app behind HTTPS (reverse proxy) and set `COOKIE_SECURE=true`.
- Keep the MEXC key read+trade only, no withdrawal, with an IP whitelist.
- Do not run the API as root. Mount the DB on a private volume.
- Back up `.data/goodz.db` (and WAL) before upgrades; test restore.
- Keep `LIVE_TRADING_ENABLED=false` until paper validation is complete.
- Review Dependabot/CodeQL/Semgrep findings; do not merge with critical alerts.
- Rotate keys after any suspected leak, laptop loss or screen share.

## Out of scope

- Profitability, trading losses, exchange downtime, liquidation, funding costs and MEXC API
  behavior changes.
- Self-XSS from pasting untrusted values into the dashboard is still treated as a bug if it
  can execute script or exfiltrate secrets.

## Disclosure

We credit reporters in the advisory unless requested otherwise. No bounty program is
offered at this time.
