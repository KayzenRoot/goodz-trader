# Accessibility and mobile

The dashboard is a control surface. WCAG 2.2 AA is the target for the critical flows:
login, overview, start/stop/kill, trade detail/replay, settings save and logs.

## Implemented

- **Labels**: every input/select has a `<label for>` or `aria-label`; `NumberField` uses a
  generated id; the leverage input has an explicit label.
- **Keyboard/focus**: global `:focus-visible` outline, native controls, dialogs trap focus via
  Radix, no custom clickable `div` without a role for primary actions.
- **Color is never the only signal**: PnL/status badges include text (`W/L`, `Parado`, `Pausado`,
  severity labels), not just red/green.
- **Charts**: every chart exposes `role="img"` with a textual summary (equity range, daily PnL,
  hourly total, R distribution count, replay entry/exit). Tooltips remain hover-only; the
  summary is the screen-reader path.
- **Reduced motion**: `prefers-reduced-motion: reduce` collapses animations/transitions.
- **Mobile 390px**: overview, trades/detail dialog, replay and settings are covered by an E2E
  test that asserts no page-level horizontal scroll. Wide tables scroll inside their own
  container.
- **Destructive controls**: stop-with-close, close position and kill switch use confirmation
  dialogs with explicit labels.
- **Alert center**: halt, feed offline/stale, private API, loss progress, target, reconnects and
  demo data are announced in one `aria-live="polite"` list.

## Audit evidence

```bash
pnpm --filter @goodz/web exec playwright test e2e/a11y.spec.ts e2e/mobile.spec.ts
pnpm --filter @goodz/web exec playwright test
```

The audit checks:

- no unnamed `input/select/textarea` on `/`, `/trades`, `/settings`;
- no unnamed `button/a`;
- `html lang="pt-BR"`;
- no `<img>` without `alt`;
- keyboard Tab moves focus into the page;
- `document.documentElement.scrollWidth <= 390` on mobile pages;
- trade dialog width <= 390 and replay section visible.

## Manual WCAG AA checklist (critical flows)

- [x] Login form has labelled password field and submit button.
- [x] Overview status, halt and feed states have text, not only color.
- [x] Start button opens a dialog; stop/kill require explicit confirmation.
- [x] Trades table has headers; row opens a labelled dialog.
- [x] Replay chart has a text alternative with entry/exit.
- [x] Settings fields are labelled; validation errors are text.
- [x] Logs/audit tabs are keyboard reachable.
- [x] Reduced motion honored.

## Known gaps

- No automated axe-core run in CI yet; the checks above are DOM-level and manual.
- Charts use canvas; the textual `aria-label` is the accessible equivalent, not a data table.
- Contrast is checked visually against the dark palette; a token-level contrast test is future
  work.
- Mobile landscape and 320px are not covered by the automated test (390px portrait is).
