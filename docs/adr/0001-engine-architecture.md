# ADR 0001 — Single-process engine, Fastify API, React dashboard

- Status: accepted
- Date: 2026-10-26

## Context

We need a fast scalper with a rich dashboard, a persistent ledger and strong risk controls.
The operator is a single user running the app locally or on one VPS. MEXC offers REST and
WebSocket APIs but no testnet. Operational simplicity and fast iteration matter more than
horizontal scale.

## Decision

- One Node process hosts the Fastify API, the trading engine and the market feed.
- The dashboard is a Vite/React SPA served by the same API in production.
- Domain logic lives in `packages/core`; the MEXC client in `packages/mexc`.
- Persistence is SQLite (WAL) via `better-sqlite3` and a hand-written migration runner.
- Realtime uses one typed `EventBus` and a `/ws` fan-out; REST is the fallback.
- Paper and live share the same engine; only the broker and feed differ.

Rejected alternatives:

- **Next.js full-stack**: serverless assumptions and route handlers are a poor fit for a
  long-lived trading loop; a single-port Fastify + SPA is simpler to deploy.
- **Separate engine service + Postgres + Redis**: more moving parts, no benefit at one user.
- **Exchange SDK**: the official surface is small; owning signing/transport lets us test and
  bound rate limits precisely.
- **Prisma/Drizzle**: a few queries and a tiny schema; prepared statements keep the bundle
  small and avoid an ORM layer in the hot path.

## Consequences

Positive: one deployable, one DB, fast local dev, easy E2E, deterministic paper mode.

Negative: one process is a single point of failure; a long CPU stall affects the API and
engine; SQLite is local-only. A crash does not auto-resume trading (by design). Scaling to
multiple users would require a different architecture.

## Follow-ups

- Private WS/reconciliation (M2).
- Metrics/health (M4).
- Exact fixed-point ledger (M5 research).
