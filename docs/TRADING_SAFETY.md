# Trading safety

This document is normative. If code and this document disagree, stop and open an issue.

## The only entry path

```
market event -> MomentumScalper -> evaluateEntry -> broker.placeOrder
```

- No route, UI button, script or test may call the broker directly.
- `evaluateEntry` must be called with a fresh snapshot, current equity, available balance,
  daily PnL, trade count, consecutive losses, last loss time, open positions and order rate.
- If the decision is blocked, log a throttled debug line and do nothing.

## Sizing rules

- `riskUsd = equity × riskPerTradePct`
- `stopDistance = price × stopLossBps / 10_000`
- `qtyByRisk = riskUsd / (stopDistance × contractSize)`
- Caps: `maxNotionalUsd`, `maxMarginPerTradeUsd`, `availableBalance × 0.8`.
- Floor to `volUnit`; if the result is below `minVol`, use `minVol` only if its notional and
  risk fit the caps. Otherwise block.
- Never round up to meet the minimum. Never increase leverage to "make it fit".

## Daily guard

- Day boundary: `resetHourUtc` (default 00:00 UTC), not local time.
- `dayPnl = realizedDay + unrealizedNet` where both are net of fees.
- Stop: `dayPnl <= -lossLimitUsd` -> halt `daily_stop`, close if configured.
- Target: `dayPnl >= profitTargetUsd` and `stopOnTarget` -> halt `daily_target`.
- Trades/day, consecutive losses and kill switch also halt.
- A halted bot never auto-resumes. Start is refused while the guard condition still holds.
- `closeOnStop` controls flattening on daily target; daily stop/error/kill always attempt to
  flatten because leaving an unmanaged leveraged position is worse.

## Fees and edge

MEXC futures charges maker and taker fees. A scalp must clear **round-trip fees + spread +
slippage**. The config validator rejects `takeProfitBps <= feeMaker + feeTaker + 2 bps`.
The analytics and daily guard use net PnL, not gross.

Funding is not charged per trade in the ledger yet; positions are short-lived, but this is a
known gap. Do not hold positions across funding windows without accounting for it.

## Live preflight

The engine refuses live start unless all are true:

1. `LIVE_TRADING_ENABLED=true` on the server.
2. `config.mode === 'live'`.
3. Confirmation phrase typed exactly: `CONFIRMO TRADING REAL`.
4. API key + secret present (stored encrypted or env).
5. Kill switch off.
6. Contract `apiAllowed` true, leverage within contract limits.
7. MEXC account in **one-way** mode.
8. No open position and no open orders on the symbol.
9. USDT available balance > 0.
10. Daily guard not already tripped.

If any check fails, the start request returns 409 with a stable code. Do not "fix" a failed
check by disabling it; fix the account/config.

## Kill switch

- UI: red octagon in the topbar.
- API: `POST /api/bot/kill`.
- Effect: persists `execution.killSwitch=true`, halts, cancels pending orders, attempts a
  market close, disconnects. Start is blocked until the switch is disabled in Settings.
- If the close fails, close manually on MEXC and reconcile the ledger before restarting.

## Maker-first execution

- A maker entry posts **post-only** on our own side of the book, never crossing the spread.
- If the passive price improves by at least `requoteMinMoveBps` after `requoteAfterMs`, the bot
  cancels and reposts, bounded by `maxRequotes` and the original `makerTimeoutMs`.
- Cancel is always confirmed before a replacement is sent. If the cancel cannot be confirmed,
  no new order is placed; after three failures the bot halts instead of risking a duplicate.
- If a submit or requote response is lost, the order state is ambiguous: the bot halts and
  cancels all orders instead of assuming rejection and sending a second entry.
- A partial fill is never rounded up. The position, notional, margin, fees and stop size use
  the **actually filled quantity**. Any remainder is canceled and is not chased with a second
  entry.
- After the maker timeout (or a post-only rejection), at most **one** taker fallback is allowed
  when `allowTakerFallback=true`; the risk guard is re-evaluated first.
- Entry metrics (maker fill rate, average fill time, requotes, partial fills, fallback count
  and estimated fallback fee cost) are shown on the overview.

## Paper vs live

- Paper uses a synthetic random-walk feed by default. It is useful for UI and risk plumbing,
  not proof of edge. You can select MEXC public data as the paper feed.
- Paper fills are optimistic by default: full fill, no queue position, no funding, no
  liquidation. The paper broker also supports deterministic partial-fill simulation
  (`partialFillRatio`) for drills and tests.
- Demo seed data is fabricated and marked `demo`. It must never be used to claim performance.
- Live fills are polled and pushed over the private WS; latency and partial fills are real.
  The live path is **beta** until validated with a tiny notional.
- Fees come from the exchange fill report (`makerFee` + `takerFee`) and are included in the
  trade ledger and daily guard. A mismatch must be treated as an incident, not rounded away.

## Manual validation before increasing size

1. Run paper for at least a few hundred trades with realistic fees/spread.
2. Verify win rate, profit factor and max drawdown in Analytics.
3. Inspect canceled maker attempts and time-stop behavior.
4. Live: start with the smallest contract, one trade at a time, and compare the ledger with
   the MEXC order history. Confirm fees and average prices match.
5. Only then consider increasing `maxNotionalUsd` or risk %. Increase one variable at a time.

## Incident checklist

- Press **Kill switch**.
- Check open positions/orders on MEXC directly.
- Do not restart until the position is flat or deliberately reconciled.
- Export trades CSV, copy logs, note the halt reason and timestamps.
- Rotate API keys if credentials may have leaked.
- Open an incident issue with evidence; do not silently patch and restart.

## Idempotency

- Every submit uses a unique `externalOid`; retries after a lost response reuse it.
- Never generate a new client order ID to "retry" a submit of the **same** order; that is a
  duplicate order.
- A requote is different: the old order is canceled (confirmed) first, then a new order is
  posted for the remaining quantity with a new `externalOid`. The cancel confirmation is the
  barrier that makes it safe.
- Cancels/close orders also carry stable IDs and are audited.

## Private WS reconciliation

- The private order/position stream is a latency optimization, not the source of truth.
- Every re-login runs a full REST reconciliation. Orphan/duplicate positions or orders,
  side mismatch or quantity mismatch **halt** the bot with an intervention message.
- A pending entry that appears as a position before the local poll is deferred one tick; it
  is not treated as orphan.
- A start with an open position or leftover order is refused.

## Known limitations

- Private WS is implemented; live fill/cancel/partial-fill semantics still need the tiny
  real validation in issue #17.
- No partial-fill-aware close orchestration beyond the actual filled quantity. The position is
  opened with what the exchange filled; the canceled remainder is not chased.
- No automatic reconciliation of a live position after a **process crash**; startup refuses
  until a human reviews it.
- Funding, liquidation price and ADL are not projected in PnL.
- Exact fixed-point ledger is not implemented; REAL values are rounded.
- No backtester; synthetic history is not market data.

**Leveraged futures can cause total loss. This software is provided as-is, without any
profitability or fitness guarantee.**
