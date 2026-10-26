# Screenshots

Captured from the built app with **demo/paper data** (synthetic feed). Demo trades are
fabricated and labeled; they are not evidence of live performance.

| File                  | View                                                      |
| --------------------- | --------------------------------------------------------- |
| `overview.png`        | Equity, daily guard, risk cards, recent trades            |
| `terminal.png`        | Candles, synthetic order book, tape, position/orders/logs |
| `analytics.png`       | Equity, R distribution, daily PnL, hourly edge            |
| `settings.png`        | API connection, mode/contract, full risk controls         |
| `overview-mobile.png` | 390px responsive control surface                          |

Regenerate:

```bash
pnpm build
NODE_ENV=test SEED_DEMO=true WEB_DIST_PATH=apps/web/dist node apps/api/dist/index.js
# then use Playwright to capture the routes at 1440x1000 and 390x844
```
