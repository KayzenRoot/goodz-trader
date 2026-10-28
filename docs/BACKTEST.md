# Backtest and replay

The backtester replays the **same** `MomentumScalper`, `evaluateEntry` risk guard and
`evaluateExit` TP/SL/trailing/time-stop logic used by the paper/live engine. It is research
tooling, not a promise of future results.

## Quick start

```bash
# deterministic synthetic dataset (demo / test only)
pnpm backtest -- --synthetic --rows 5000 --seed 42 --out reports

# recorded snapshot dataset
pnpm backtest -- --dataset data/btc-2026-01-01.jsonl --out reports

# walk-forward: select on train, report out-of-sample
pnpm backtest -- --dataset data/btc-2026-01-01.jsonl \
  --walk-forward --windows 3 --train-ratio 0.7 --min-trades 3 --out reports

# compare with an exported paper ledger
pnpm backtest -- --dataset data/btc-2026-01-01.jsonl --paper paper-trades.json --out reports
```

Each run writes a versioned JSON + Markdown pair:
`reports/backtest-v1-<timestamp>-<dataset-hash>.json|md`. The JSON contains every trade and
equity point; the Markdown is the human summary. `reports/` is gitignored.

## Dataset format (JSONL)

One JSON object per line. Comments (`#`) and blank lines are ignored. At least 50 rows are
required; rows are sorted by `ts` and duplicate timestamps keep the last row.

```json
{
  "ts": 1767225600000,
  "bid": 99995.5,
  "ask": 100004.5,
  "last": 100000,
  "imbalance": 0.42,
  "tradeDelta": 0.71,
  "fundingRate": 0.0001
}
```

| Field         | Required | Notes                                                         |
| ------------- | -------- | ------------------------------------------------------------- |
| `ts`          | yes      | Unix milliseconds.                                            |
| `bid` / `ask` | yes      | Positive, `ask >= bid`. Spread is taken from the snapshot.    |
| `last`        | no       | Defaults to mid.                                              |
| `imbalance`   | no       | `-1..1`; defaults to `0`. Required for the strategy to trade. |
| `tradeDelta`  | no       | `-1..1`; defaults to `0`. Required for the strategy to trade. |
| `fundingRate` | no       | Per-8h rate, e.g. `0.0001` = 1 bp.                            |

**Candle-only data is not converted into fake imbalance/tradeDelta.** With missing order flow
the strategy correctly stays flat; the report shows zero trades. Record snapshots from the
paper feed (or a market-data recorder) to replay the actual strategy.

## Cost and execution model

- Entry fees use the configured maker/taker rates; exits always pay taker.
- Entry latency: `--latency` ms (default 250) before the fill tick.
- Taker entries/exits apply `execution.slippageBps`.
- Maker entries fill only when the market trades **through** the limit by
  `--maker-edge-bps` (default 0.5 bps); otherwise they fall back to a single taker after
  `strategy.makerTimeoutMs`, if enabled. Queue position and partial fills are not modeled.
- Funding is applied every 8h while a position is open, using the dataset rate or
  `--funding-bps` fallback (default 0).
- Liquidation is approximate: entry ± `1/leverage` adjusted by a 0.5% maintenance margin.
- Stops are triggered on mid; fills use the next observed bid/ask with slippage, so gaps can
  fill worse than the stop. Maker stop/TP orders are not modeled separately.

## Report contract

The headline is always **net** (`gross - fees + funding`). Gross, fees, funding, fee drag and
final equity are shown separately; no gross figure is labeled net.

Metrics: trades, wins/losses, win rate, net/gross PnL, fees, funding, profit factor,
expectancy, average R, max drawdown, fee drag, exposure, liquidations, maker fills, taker
fallbacks and blocked entries.

Reproducibility metadata: dataset label + SHA-256, seed, config SHA-256, row count, period,
generated timestamp and backtest version.

## Walk-forward

`--walk-forward` splits each of the N windows into train (default 70%) and test slices. A small
grid over `takeProfitBps`, `stopLossBps` and `entryThresholdBps` is evaluated **only on train**;
the best result (net PnL, minimum trades, max drawdown filter) is then run on the untouched test
slice. The report shows each window, the selected parameters and the OOS net/trades. Selection
is never performed on the test slice.

`validated: true` requires positive aggregate OOS net, enough OOS trades and every window to
pass. A negative OOS result is reported as-is; it is not hidden.

## Paper vs replay

`--paper <export.json>` accepts the API trade export (`{items:[...]}`) or an array. Only closed
`netPnl` rows are summed. The comparison is meaningful only when the paper export and replay
dataset cover the same symbol/period; live queue position, latency and fill quality are not
reproducible from the dataset. Use it to spot large divergences, not to prove the simulator.

## Known limitations

- No order-book depth impact, queue position or partial maker fills.
- No historical funding term structure unless the dataset carries `fundingRate` rows.
- No multi-position, no multi-symbol simultaneous replay.
- No automatic snapshot recorder yet; feed it recorded JSONL.
- Synthetic datasets are fixtures, not market evidence.
