# MEXC Futures API notes

Source: MEXC contract API v1 (public documentation). API behavior can change; treat this as
an implementation note, not a contract with MEXC.

## Endpoints

- REST base: `https://contract.mexc.com`
- Public WS: `wss://contract.mexc.com/edge`
- Ping: `GET /api/v1/contract/ping`
- Contracts: `GET /api/v1/contract/detail?symbol=BTC_USDT`
- Ticker: `GET /api/v1/contract/ticker?symbol=...`
- Depth snapshot: `GET /api/v1/contract/depth/{symbol}?limit=20`
- Deals: `GET /api/v1/contract/deals/{symbol}?limit=50`
- Klines: `GET /api/v1/contract/kline/{symbol}?interval=Min1&start=&end=`
- Assets: `GET /api/v1/private/account/assets`
- Positions: `GET /api/v1/private/position/open_positions`
- Open orders: `GET /api/v1/private/order/list/open_orders/{symbol}`
- Order: `GET /api/v1/private/order/get/{orderId}`
- Position mode: `GET /api/v1/private/position/position_mode`
- Leverage: `POST /api/v1/private/position/change_leverage`
- Place order: `POST /api/v1/private/order/submit`
- Cancel: `POST /api/v1/private/order/cancel`
- Cancel all: `POST /api/v1/private/order/cancel_all`

## Signing

```
paramString =
  GET  -> sorted `key=value` joined by `&`, URL-encoded, nulls omitted
  POST -> exact JSON string sent as the body
signature = HMAC_SHA256(apiKey + requestTime + paramString, apiSecret).hex()
headers: ApiKey, Request-Time (ms), Signature, Content-Type: application/json
optional: Recv-Window (seconds)
```

The client signs the **exact** JSON string it sends. Do not re-stringify with a different key
order after signing.

Clock skew >10s is rejected (`513`). The client syncs `/contract/ping` and adds the offset.

## Order fields

| Field         | Values                                                            |
| ------------- | ----------------------------------------------------------------- |
| `side`        | 1 open long, 2 close short, 3 open short, 4 close long            |
| `type`        | 1 limit, 2 post-only, 3 IOC, 4 FOK, 5 market, 6 market-to-current |
| `openType`    | 1 isolated, 2 cross                                               |
| `vol`         | contracts, respecting `volUnit`/`minVol`                          |
| `price`       | limit price; market currently sends 0                             |
| `externalOid` | client order ID, max 32 chars                                     |
| `positionId`  | recommended when closing                                          |
| `reduceOnly`  | one-way mode only                                                 |

The documentation labels order/cancel sections "under maintenance", but the endpoints are
used by live trading. Validate with a tiny order before trusting them.

## Rate limits

- Public/account endpoints commonly 20 requests / 2 seconds.
- The client uses a conservative sliding window of 15 / 2 seconds by default.
- Order submit can be throttled; the engine limits orders/min and handles code 2037.

## Error mapping (highlights)

| Code        | Meaning              | Action                             |
| ----------- | -------------------- | ---------------------------------- |
| 401/402/602 | auth/key/signature   | fix credentials, rotate key        |
| 406         | IP not whitelisted   | add server IP                      |
| 510/2037    | rate limit           | back off, reduce polling           |
| 513         | clock skew           | sync time                          |
| 2005        | insufficient balance | reduce size / deposit              |
| 2015        | precision            | use contract `priceUnit`/`volUnit` |
| 2019        | active position      | reconcile/close before start       |
| 2021        | leverage mismatch    | align config/position              |
| 2031        | risk limit           | reduce size/leverage               |

## WebSocket

Public:

```json
{"method":"sub.ticker","param":{"symbol":"BTC_USDT"}}
{"method":"sub.deal","param":{"symbol":"BTC_USDT"}}
{"method":"ping"}
```

Ping every 15s; server disconnects after 60s without a ping. Reconnect with exponential
backoff. Private login (`method: login`) signs `apiKey + reqTime`; private channels include
`push.personal.order`, `order.deal`, `position`, `asset`. The current client only implements
public ticker/deal; depth is REST-polled and live fills are polled. Private WS is a tracked
issue.

## Contract metadata

Important fields: `contractSize`, `minVol`, `maxVol`, `volUnit`, `priceUnit`, `priceScale`,
`volScale`, `minLeverage`, `maxLeverage`, `makerFeeRate`, `takerFeeRate`, `apiAllowed`.
Never hardcode BTC assumptions in the engine; the paper fallback is only for offline demos.

## Assumptions to validate with a real tiny order

1. Market order `price: 0` acceptance.
2. Cancel endpoint payload shape (raw array of IDs vs object).
3. Post-only rejection behavior and error code.
4. `reduceOnly` + `positionId` behavior for partial closes.
5. Fee fields (`makerFee`/`takerFee`) sign and inclusion in order responses.
6. Exact average fill price precision.

Track results in the "live validation" issue before enabling larger notional.
