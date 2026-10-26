// Production backlog. `bootstrap.mjs` creates labels, milestones and issues from this file.
// Bodies are Markdown; keep them actionable and free of secrets.

export const milestones = [
  {
    title: 'M0 — Fundação & Governança',
    description: 'Repo, CI, rulesets, ECC, ADRs e documentação base.',
  },
  {
    title: 'M1 — Paper MVP',
    description: 'Paper scalper funcional, ledger, settings e dashboard completo.',
  },
  {
    title: 'M2 — Live Hardening',
    description: 'Reconciliação, private WS, maker live e validação com notional mínimo.',
  },
  {
    title: 'M3 — Dashboard Pro',
    description: 'Mobile, acessibilidade, replay e central de alertas.',
  },
  {
    title: 'M4 — Deploy & Observabilidade',
    description: 'Docker, backups, métricas, healthchecks e alertas externos.',
  },
  {
    title: 'M5 — Backtest & Otimização',
    description: 'Replay, fees/slippage/funding, walk-forward e ledger fixed-point.',
  },
];

export const labels = [
  ['type/epic', '6f42c1', 'Épico / iniciativa'],
  ['type/feature', '1d76db', 'Nova capacidade'],
  ['type/bug', 'd73a4a', 'Defeito'],
  ['type/security', 'b60205', 'Segurança / risco'],
  ['type/chore', 'fbca04', 'Manutenção / infra'],
  ['type/docs', '0075ca', 'Documentação'],
  ['type/test', '0e8a16', 'Testes e qualidade'],
  ['area/engine', '5319e7', 'Motor, estratégia, execução'],
  ['area/risk', 'e99695', 'Risk guard, sizing, guard diário'],
  ['area/mexc', 'c2e0c6', 'Cliente e semântica MEXC'],
  ['area/api', '0052cc', 'Fastify, rotas, WS, auth'],
  ['area/web', '1d76db', 'Dashboard React'],
  ['area/db', '006b75', 'SQLite, ledger, migrações'],
  ['area/infra', '000000', 'CI, Docker, deploy, observabilidade'],
  ['area/dx', '8fbc8f', 'Ferramentas, agentes, docs'],
  ['priority/P0', 'b60205', 'Bloqueia dinheiro/uso'],
  ['priority/P1', 'd93f0b', 'Próximo ciclo'],
  ['priority/P2', 'fbca04', 'Importante, não urgente'],
  ['priority/P3', '0e8a16', 'Depois'],
  ['status/ready', '0e8a16', 'Pronto para execução'],
  ['status/blocked', 'd73a4a', 'Bloqueado por dependência'],
];

export const issues = [
  {
    title: '[Epic] M0 — Fundação, governança e pipeline de qualidade',
    labels: ['type/epic', 'area/dx', 'priority/P0', 'status/ready'],
    milestone: 'M0 — Fundação & Governança',
    body: `## Objetivo
Criar a base de engenharia que impede regressão e perda de contexto: repo protegido, CI
obrigatório, auditorias, docs e workflow de agentes.

## Escopo
- Ruleset em \`main\` e tags \`v*\`; squash-only; branch deletion automática.
- CI com Quality Gate + CodeQL; E2E Playwright; security scans e Dependabot.
- ECC adaptado ao OpenCode (rules, agents, commands, skills).
- ADRs, arquitetura, safety, MEXC, runbook e roadmap.
- Issues/milestones como fonte da verdade.

## Critério de saída
- [ ] PR de fundação verde.
- [ ] Ruleset ativo com **Quality Gate** e **CodeQL**.
- [ ] Secret scanning, push protection, Dependabot e private reporting ativos.
- [ ] Issues criadas e priorizadas.
- [ ] Nenhum segredo em git, logs ou issues.

## Não escopo
- Validar lucratividade ou executar ordens reais.
- Backtest histórico.`,
  },
  {
    title: '[Chore] Rulesets, branch protection e segurança do repositório',
    labels: ['type/chore', 'area/infra', 'area/dx', 'priority/P0', 'status/ready'],
    milestone: 'M0 — Fundação & Governança',
    body: `## Objetivo
Proteger \`main\` e a supply chain sem impedir o fluxo solo.

## Entregáveis
- Ruleset \`main-protection\`: PR obrigatório, linear history, conversas resolvidas,
  checks **Quality Gate** e **CodeQL**, sem force push/delete, sem bypass.
- Ruleset \`release-tags\`: \`refs/tags/v*\` sem delete/force.
- Squash-only, auto-delete head branch, secret scanning + push protection,
  non-provider patterns, validity checks, Dependabot, private vulnerability reporting.
- Actions token read-only; PR approval por Actions desabilitado.

## Verificação
- [ ] \`gh api repos/KayzenRoot/goodz-trader/rulesets\` lista 2 rulesets.
- [ ] \`gh api repos/KayzenRoot/goodz-trader --jq .security_and_analysis\` mostra proteções.
- [ ] Um PR de teste exige os checks e não permite merge direto.

## Evidência
\`docs/engineering/QUALITY_GATES.md\` e \`docs/engineering/GITHUB_APPS.md\`.`,
  },
  {
    title: '[Test] CI + E2E Playwright como Quality Gate',
    labels: ['type/test', 'area/dx', 'priority/P0', 'status/ready'],
    milestone: 'M0 — Fundação & Governança',
    body: `## Objetivo
Todo PR deve provar build, tipos, lint, testes e os fluxos críticos do dashboard.

## Entregáveis
- Workflow CI: format, lint, typecheck, coverage, build, E2E e **Quality Gate** agregado.
- CodeQL javascript-typescript + Semgrep + Gitleaks + actionlint + dependency review.
- E2E com DB temporário: overview, start/stop paper, settings persist, terminal/trades/logs.
- Artefatos de coverage e Playwright em falha.

## Critério de aceite
- [ ] \`pnpm test:coverage\` passa (thresholds do repo).
- [ ] \`pnpm e2e\` passa local e no CI.
- [ ] Check **Quality Gate** aparece no PR e é obrigatório.
- [ ] Nenhum teste usa API privada real ou chave real.`,
  },
  {
    title: '[Docs] Integrar ECC (rules, commands, agents, skills) ao OpenCode',
    labels: ['type/docs', 'area/dx', 'priority/P1', 'status/ready'],
    milestone: 'M0 — Fundação & Governança',
    body: `## Objetivo
Adotar o workflow de engenharia do ECC sem inflar contexto nem duplicar hooks.

## Entregáveis
- \`.opencode/instructions\` (ECC + regras do projeto), \`opencode.json\`.
- 10 agentes e 12 comandos de alto valor; 12 skills sob demanda.
- Regras comuns/typescript para referência.
- \`docs/engineering/ECC.md\` com versão e commit upstream.

## Fora de escopo
- Plugin/hooks runtime, MCPs e catálogo completo de 311 skills.

## Aceite
- [ ] \`opencode.json\` válido e skills carregáveis.
- [ ] \`AGENTS.md\` aponta para safety/architecture.
- [ ] Nenhum segredo ou configuração global sobrescrita.`,
  },
  {
    title: '[Docs] ADRs, arquitetura, safety, MEXC e runbook',
    labels: ['type/docs', 'area/dx', 'priority/P1', 'status/ready'],
    milestone: 'M0 — Fundação & Governança',
    body: `## Objetivo
Registrar decisões e procedimentos para que o próximo agente/humano não reinvente o motor.

## Entregáveis
- \`docs/ARCHITECTURE.md\`, \`TRADING_SAFETY.md\`, \`MEXC.md\`, \`RUNBOOK.md\`, \`ROADMAP.md\`.
- ADR 0001 (single process/Fastify/SQLite), 0002 (risk guard), 0003 (ledger).
- \`SECURITY.md\`, \`CONTRIBUTING.md\`, \`AGENTS.md\`.
- Checklist live e limitações conhecidas explícitas.

## Aceite
- [ ] Docs batem com o código (endpoints, defaults, limites).
- [ ] Nenhuma promessa de lucro.
- [ ] Runbook cobre kill switch, backup, restore e rotação de chave.`,
  },
  {
    title: '[Feature] Cliente MEXC Futures: REST assinado, WS público e contratos',
    labels: ['type/feature', 'area/mexc', 'priority/P0', 'status/ready'],
    milestone: 'M1 — Paper MVP',
    body: `## Objetivo
Cliente tipado e testável para contratos USDT-M da MEXC.

## Entregáveis
- Assinatura HMAC SHA256 exata (GET ordenado, POST JSON exato), headers e sync de relógio.
- Rate limiter conservador; erros mapeados para códigos amigáveis/retryable.
- REST: contrato, ticker, depth, deals, klines, assets, posições, ordens, leverage,
  position mode, submit/cancel.
- WS público: ticker + deal, ping/reconnect.
- Contrato normalizado (contractSize, volUnit, minVol, priceUnit, fees, apiAllowed).

## Aceite
- [ ] Testes de assinatura e de corpo exato.
- [ ] Nenhum método privado é chamado em teste sem mock.
- [ ] Semântica live de market/cancel documentada e validada no issue de live hardening.

## Limitação
Private WS e reconciliação ficam no M2.`,
  },
  {
    title: '[Feature] Paper broker + feeds sintético/MEXC + demo determinístico',
    labels: ['type/feature', 'area/engine', 'priority/P0', 'status/ready'],
    milestone: 'M1 — Paper MVP',
    body: `## Objetivo
Permitir desenvolvimento e E2E offline com fills plausíveis, taxas e dados demo marcados.

## Entregáveis
- Feed sintético com random walk, book, tape, imbalance, spread e latência simulada.
- Feed MEXC público (ticker/deal WS + depth REST), sem fallback silencioso.
- Paper broker: market com slippage, maker limit por cruzamento, fees maker/taker,
  cancelamento e close.
- Seed demo determinístico, \`is_demo=1\`, sem sobrescrever stats reais.

## Aceite
- [ ] Testes de fill market/maker, rejeição post-only e close.
- [ ] UI mostra selo demo.
- [ ] Troca de feed/símbolo não deixa snapshot/book dessincronizados.`,
  },
  {
    title: '[Feature] Estratégia momentum + order flow com maker-first e fallback',
    labels: ['type/feature', 'area/engine', 'priority/P0', 'status/ready'],
    milestone: 'M1 — Paper MVP',
    body: `## Objetivo
Scalp rápido com três confirmações independentes e entradas econômicas.

## Regras
- EMA rápida/lenta, trend em bps, imbalance do book top-5, delta de agressão.
- Cooldown, hold mínimo, time stop, TP, SL, trailing.
- Maker-first com timeout; fallback taker opcional e uma única tentativa.

## Aceite
- [ ] Testes para long, short, fluxo divergente, cooldown e amostra insuficiente.
- [ ] Nenhum sinal entra sem risk guard.
- [ ] Parâmetros expostos em Settings e validados por Zod.
- [ ] Tuning/otimização fica para o backtest (M5).`,
  },
  {
    title: '[Feature] Risk guard server-side: sizing, stop/meta diária e kill switch',
    labels: ['type/feature', 'area/risk', 'priority/P0', 'status/ready'],
    milestone: 'M1 — Paper MVP',
    body: `## Objetivo
Impedir que o bot ultrapasse o orçamento mesmo com bug de estratégia ou UI.

## Entregáveis
- Sizing por risco, notional, margem e saldo; arredondamento para baixo no volUnit.
- Bloqueios: kill switch, stop diário, meta, trades/dia, ordens/min, perdas consecutivas,
  cooldown, spread, equity mínima, leverage do contrato, API desabilitada.
- Guard diário líquido de taxas; reset UTC; halt persistido sem auto-resume.
- Kill switch persistente e flatten de emergência.
- Testes de todos os bloqueios e do sizing.

## Aceite
- [ ] Nenhuma rota/UI coloca ordem.
- [ ] Saída sempre permitida mesmo com entrada bloqueada.
- [ ] Regressão cobre \`daily_stop\` e \`daily_target\`.`,
  },
  {
    title: '[Feature] Ledger SQLite e analytics de fees/PnL',
    labels: ['type/feature', 'area/db', 'priority/P0', 'status/ready'],
    milestone: 'M1 — Paper MVP',
    body: `## Objetivo
Fonte de verdade auditável para trades, ordens, equity, logs e auditoria.

## Entregáveis
- Schema + migrações (bot_config/state, trades, orders, equity, daily_stats, logs, audit).
- Repository com prepared statements e WAL.
- Fees explícitas, net PnL, R múltiplo, motivo de fechamento, demo flag.
- Seed demo, snapshots de equity, stats diários.
- Export CSV.

## Aceite
- [ ] CRUD e filtros cobertos por teste.
- [ ] Nenhuma query interpola valor de usuário.
- [ ] Backup/restore documentado; limitação REAL/fixed-point registrada.`,
  },
  {
    title: '[Feature] API Fastify, WebSocket, auth e Settings criptografadas',
    labels: ['type/feature', 'area/api', 'priority/P0', 'status/ready'],
    milestone: 'M1 — Paper MVP',
    body: `## Objetivo
Controle e observabilidade em tempo real com segredos protegidos.

## Entregáveis
- Rotas de status, métricas, analytics, trades, market, bot, settings, logs e audit.
- WS tipado com status inicial, heartbeat e backpressure.
- Sessão opcional (HttpOnly/SameSite/Strict), rate limit, CORS, Helmet.
- AES-256-GCM para API key/secret/Telegram; máscara e auditoria.
- Gates de start paper/live com códigos estáveis.

## Aceite
- [ ] Testes de auth, validação, redaction e live gate.
- [ ] Settings só salvam com bot parado.
- [ ] Nenhum segredo em resposta/log.`,
  },
  {
    title: '[Feature] Settings page com controle total do bot',
    labels: ['type/feature', 'area/web', 'priority/P0', 'status/ready'],
    milestone: 'M1 — Paper MVP',
    body: `## Objetivo
Uma tela para operar o bot sem editar env/DB.

## Entregáveis
- Conexão (key/secret/test), modo paper/live, símbolo/watchlist, leverage, margem.
- Estratégia completa, risco, guard diário, fees, kill switch, notificações.
- Validação Zod no cliente, erros por campo, preview de risco/TP líquido.
- Botão salvar bloqueado se o bot estiver rodando; descartar/reload.
- Confirmação explícita para live e kill switch.

## Aceite
- [ ] E2E altera meta diária e persiste após reload.
- [ ] Segredo nunca reaparece em claro.
- [ ] Layout usável em 390px.`,
  },
  {
    title: '[Feature] Overview + risk guard visual + saúde do sistema',
    labels: ['type/feature', 'area/web', 'priority/P0', 'status/ready'],
    milestone: 'M1 — Paper MVP',
    body: `## Objetivo
Responder em 5 segundos: quanto tenho, quanto ganhei/perdi, o bot está seguro, o feed está vivo.

## Entregáveis
- Equity, PnL do dia, progresso meta/stop, exposição, trades.
- Cards: win rate, profit factor, expectancy, drawdown, tempo médio.
- Curva de equity 24h/7d/30d, PnL diário, posição aberta, estratégia.
- Raio-x do risk guard, saúde do feed/API/WS, últimos trades.
- Ações: terminal, settings, fechar posição.

## Aceite
- [ ] Loading/empty/error/demo.
- [ ] Números líquidos de taxas.
- [ ] Mobile sem overflow horizontal.`,
  },
  {
    title: '[Feature] Terminal: candles, order book, tape e posição',
    labels: ['type/feature', 'area/web', 'priority/P0', 'status/ready'],
    milestone: 'M1 — Paper MVP',
    body: `## Objetivo
Dar contexto de mercado e execução no mesmo lugar.

## Entregáveis
- Chart lightweight-charts com candles, volume, 1m/5m/15m e linhas de entrada/TP/SL/trail.
- Order book com profundidade, spread, imbalance e origem coerente com o feed.
- Tape de agressão, latência e status.
- Abas posição/ordens/logs, fechar a mercado.
- Fonte de candles coerente com o feed (synthetic vs MEXC).

## Aceite
- [ ] Sem misturar candles MEXC com feed sintético.
- [ ] Sem overflow em desktop/mobile.
- [ ] Posição e ordens refletem o ledger.`,
  },
  {
    title: '[Feature] Trades & Analytics com export CSV',
    labels: ['type/feature', 'area/web', 'priority/P1', 'status/ready'],
    milestone: 'M1 — Paper MVP',
    body: `## Objetivo
Auditar cada trade e medir se o edge sobrevive às taxas.

## Entregáveis
- Filtros status/modo/símbolo, paginação, detalhe com ordens.
- CSV com fees, gross/net, R, motivo, timestamps.
- Equity, PnL diário, win rate por hora UTC, distribuição R, motivos de saída.
- Selo demo.

## Aceite
- [ ] CSV abre em planilha e bate com a tela.
- [ ] Números conferem com o ledger (não com o feed).
- [ ] Tabela legível em 1440px e mobile.`,
  },
  {
    title: '[Security] Live hardening: private WS, reconciliação e idempotência',
    labels: ['type/security', 'area/mexc', 'area/risk', 'priority/P0', 'status/ready'],
    milestone: 'M2 — Live Hardening',
    body: `## Objetivo
Reduzir a distância entre o ledger e a exchange antes de liberar tamanho.

## Escopo
- Private WS (login, order, order.deal, position, asset) com reconexão.
- Reconciliação no start e após reconexão: ordens, posições, fills parciais.
- Idempotência por \`externalOid\`; recuperação de resposta perdida após submit.
- Detecção de posição órfã/duplicada; halt seguro e instrução de intervenção.
- Testes de estados: fill perdido, cancel tardio, reconnect, duplicate submit.
- Drill: matar processo com posição paper/live simulada e reconciliar.

## Aceite
- [ ] Nenhum start live com divergência não resolvida.
- [ ] Logs e audit mostram a decisão de reconciliação.
- [ ] Testes não chamam API privada real.
- [ ] Runbook atualizado.`,
  },
  {
    title: '[Feature] Validação live com notional mínimo e conciliação do ledger',
    labels: ['type/feature', 'area/mexc', 'priority/P0', 'status/blocked'],
    milestone: 'M2 — Live Hardening',
    body: `## Objetivo
Provar a semântica real da MEXC com o menor risco possível.

## Pré-requisitos
- Conta one-way, flat, API read+trade, IP whitelist.
- \`LIVE_TRADING_ENABLED=true\`, phrase, kill switch acessível.
- Private WS/reconciliação do issue de live hardening concluído.

## Matriz mínima
- [ ] Market open/close com 1 contrato; comparar avg price/fees.
- [ ] Limit post-only + cancel; validar payload de cancel e estados.
- [ ] IOC/reduceOnly/positionId em close parcial.
- [ ] Clock skew e rate limit observados.
- [ ] Ledger vs histórico MEXC: qty, preço médio, fee, net PnL.

## Aceite
- [ ] Relatório com timestamps, hashes/IDs e diferenças.
- [ ] Nenhuma ordem de teste fica aberta.
- [ ] Achados viram fixes/limitações no runbook.
- [ ] Só então aumentar notional.`,
  },
  {
    title: '[Feature] Maker-first live: post-only, requote e partial fills',
    labels: ['type/feature', 'area/engine', 'priority/P1', 'status/ready'],
    milestone: 'M2 — Live Hardening',
    body: `## Objetivo
Reduzir fee de entrada sem transformar o maker em uma armadilha.

## Escopo
- Post-only no melhor bid/ask, timeout, cancel/replace limitado.
- Fallback taker único e idempotente.
- Fill parcial: ajustar trade/position/qty, não assumir fill total.
- Rejeição post-only, cancel tardio e ordem órfã.
- Métricas: taxa de fill maker, tempo até fill, custo do fallback.

## Aceite
- [ ] Paper simula requote e fill parcial.
- [ ] Live valida com 1 contrato.
- [ ] Nenhuma ordem duplicada em retry/timeout.
- [ ] Fees reais reconciliadas.`,
  },
  {
    title: '[Feature] Notificações confiáveis (Telegram/webhook) com retry',
    labels: ['type/feature', 'area/api', 'priority/P2', 'status/ready'],
    milestone: 'M2 — Live Hardening',
    body: `## Objetivo
Saber de trade/halt mesmo fora do dashboard.

## Escopo
- Fila com retry/backoff e timeout; não bloquear o engine.
- Deduplicação por trade/halt.
- Telegram + webhook; teste de conexão.
- Alertas: halt, close fail, feed stale, daily target/stop.
- Nunca logar token/chat id sensível.

## Aceite
- [ ] Teste com mock de 429/500 e recuperação.
- [ ] Engine não sofre backpressure.
- [ ] Documentação de setup no runbook.`,
  },
  {
    title: '[UX] Dashboard Pro: mobile, acessibilidade, replay e alertas',
    labels: ['type/feature', 'area/web', 'priority/P2', 'status/ready'],
    milestone: 'M3 — Dashboard Pro',
    body: `## Objetivo
Transformar o dashboard em uma superfície de operação confiável.

## Escopo
- Auditoria 390px/768px/1440px; sem scroll horizontal de página.
- Teclado/focus, labels, contraste, reduced-motion, gráficos com resumo textual.
- Trade replay: trade → candles/entrada/saída.
- Central de alertas: halt, feed, API, drawdown, meta.
- Comparação paper vs live e relatório diário.

## Aceite
- [ ] Checklist WCAG AA para fluxos críticos.
- [ ] E2E mobile.
- [ ] Nenhum controle destrutivo sem confirmação.`,
  },
  {
    title: '[Ops] Docker, backup/restore, retenção e runbook drill',
    labels: ['type/chore', 'area/infra', 'priority/P0', 'status/ready'],
    milestone: 'M4 — Deploy & Observabilidade',
    body: `## Objetivo
Operar em uma VPS sem perder o ledger nem expor o dashboard.

## Escopo
- Docker multi-stage + Compose com volume, non-root, healthcheck.
- Backup WAL-safe, restore testado e retenção de logs/equity.
- Reverse proxy/TLS, auth, firewall, \`COOKIE_SECURE\`.
- Upgrade/rollback documentado.
- Drill: restaurar backup em ambiente limpo e validar contagem/PnL.

## Aceite
- [ ] \`docker compose up -d --build\` saudável.
- [ ] Backup/restore reproduzível com evidência.
- [ ] Runbook sem lacunas.
- [ ] Nenhum segredo na imagem.`,
  },
  {
    title: '[Ops] Observabilidade: Prometheus, healthchecks e alerta externo',
    labels: ['type/feature', 'area/infra', 'priority/P2', 'status/ready'],
    milestone: 'M4 — Deploy & Observabilidade',
    body: `## Objetivo
Detectar feed morto, halt, erro de close e processo down antes de perder dinheiro.

## Escopo
- \`/metrics\` protegido: equity, day PnL, halt, feed staleness, API latency, order rate.
- Health liveness/readiness separados.
- Alerta externo (Uptime Kuma/Grafana/Telegram) para processo/health.
- Dashboard de logs/erros.
- SLO simples e playbook.

## Aceite
- [ ] Métricas documentadas e sem labels de alta cardinalidade.
- [ ] Alerta de teste dispara.
- [ ] Nenhum dado sensível exposto.`,
  },
  {
    title: '[Research] Backtest/replay com fees, slippage, funding e walk-forward',
    labels: ['type/feature', 'area/engine', 'priority/P1', 'status/ready'],
    milestone: 'M5 — Backtest & Otimização',
    body: `## Objetivo
Descobrir se o edge existe antes de arriscar capital.

## Escopo
- Replay de candles/tape/depth quando disponível; modo conservador.
- Fees maker/taker, spread, slippage, latência, funding e liquidação.
- Métricas: net PnL, PF, expectancy, drawdown, R, fee drag, exposição.
- Walk-forward/out-of-sample; sem overfit; relatório reproduzível.
- Comparar paper vs replay para validar o simulador.

## Aceite
- [ ] Um comando gera relatório versionado.
- [ ] Nenhum resultado bruto é apresentado como líquido.
- [ ] Parâmetros vencedores passam por OOS.
- [ ] Seed/dataset documentados.`,
  },
  {
    title: '[Research] Ledger fixed-point e conciliação exata',
    labels: ['type/feature', 'area/db', 'priority/P2', 'status/ready'],
    milestone: 'M5 — Backtest & Otimização',
    body: `## Objetivo
Eliminar erro de arredondamento em PnL/fees e permitir reconciliação exata.

## Escopo
- Avaliar integer micro-USDT (1e-6) ou decimal string.
- Migração com backfill e reconciliação contra trades existentes.
- Somatórios de equity/daily sem drift.
- Testes de propriedades (soma de fees/net; conservação).
- Compatibilidade com CSV/analytics/UI.

## Aceite
- [ ] Migração reversível por backup, com relatório de diferenças.
- [ ] Testes de invariantes.
- [ ] Nenhuma mudança silenciosa em PnL histórico.`,
  },
];
