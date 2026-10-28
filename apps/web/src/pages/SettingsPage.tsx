import { botConfigSchema, type BotConfig } from '@goodz/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ExternalLink,
  Gauge,
  LockKeyhole,
  PlugZap,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useContract, useSettings, useStatus } from '@/hooks/useTrader';
import { api, ApiError } from '@/lib/api';
import { fmtBps, fmtMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

type SecretsDraft = {
  apiKey: string;
  apiSecret: string;
  telegramToken: string;
  clearApi: boolean;
  clearTelegram: boolean;
};

const EMPTY_SECRETS: SecretsDraft = {
  apiKey: '',
  apiSecret: '',
  telegramToken: '',
  clearApi: false,
  clearTelegram: false,
};

const sections = [
  { id: 'connection', label: 'Conexão MEXC', icon: PlugZap },
  { id: 'mode', label: 'Modo & contrato', icon: SlidersHorizontal },
  { id: 'strategy', label: 'Estratégia', icon: Zap },
  { id: 'risk', label: 'Risco por trade', icon: ShieldAlert },
  { id: 'daily', label: 'Guard diário', icon: Target },
  { id: 'execution', label: 'Execução & taxas', icon: Gauge },
  { id: 'notifications', label: 'Notificações', icon: Bell },
  { id: 'live', label: 'Live & segurança', icon: LockKeyhole },
];

export function SettingsPage() {
  const settings = useSettings();
  const status = useStatus();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<BotConfig | null>(null);
  const [watchlistInput, setWatchlistInput] = useState('');
  const [secrets, setSecrets] = useState<SecretsDraft>(EMPTY_SECRETS);
  const [testResult, setTestResult] = useState<Awaited<
    ReturnType<typeof api.testConnection>
  > | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [killConfirm, setKillConfirm] = useState(false);

  useEffect(() => {
    if (settings.data && !draft) {
      setDraft(settings.data.config);
      setWatchlistInput(settings.data.config.watchlist.join(', '));
    }
  }, [draft, settings.data]);

  const contract = useContract(draft?.primarySymbol ?? 'BTC_USDT');
  const running = ['running', 'starting', 'stopping'].includes(status?.status ?? '');

  const parsedWatchlist = useMemo(() => {
    const symbols = watchlistInput
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    if (draft && !symbols.includes(draft.primarySymbol)) symbols.unshift(draft.primarySymbol);
    return symbols;
  }, [draft, watchlistInput]);

  const validation = useMemo(() => {
    if (!draft) return null;
    return botConfigSchema.safeParse({ ...draft, watchlist: parsedWatchlist });
  }, [draft, parsedWatchlist]);

  const dirty = useMemo(() => {
    if (!draft || !settings.data) return false;
    const watchlistChanged =
      JSON.stringify(parsedWatchlist) !== JSON.stringify(settings.data.config.watchlist);
    return (
      JSON.stringify(draft) !== JSON.stringify(settings.data.config) ||
      watchlistChanged ||
      Boolean(
        secrets.apiKey ||
        secrets.apiSecret ||
        secrets.telegramToken ||
        secrets.clearApi ||
        secrets.clearTelegram,
      )
    );
  }, [draft, parsedWatchlist, secrets, settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!validation?.success) {
        throw new Error(validation?.error.issues[0]?.message ?? 'Configuração inválida.');
      }
      return api.updateSettings({
        config: validation.data,
        secrets: {
          ...(secrets.apiKey ? { apiKey: secrets.apiKey } : {}),
          ...(secrets.apiSecret ? { apiSecret: secrets.apiSecret } : {}),
          ...(secrets.telegramToken ? { telegramBotToken: secrets.telegramToken } : {}),
          ...(secrets.clearApi ? { clearApiCredentials: true } : {}),
          ...(secrets.clearTelegram ? { clearTelegramToken: true } : {}),
        },
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data);
      setDraft(data.config);
      setWatchlistInput(data.config.watchlist.join(', '));
      setSecrets(EMPTY_SECRETS);
      setShowErrors(false);
      toast.success('Configurações salvas', {
        description: 'O motor usará os novos parâmetros no próximo start.',
      });
    },
    onError: (error) => {
      setShowErrors(true);
      toast.error('Não foi possível salvar', {
        description:
          error instanceof ApiError || error instanceof Error ? error.message : 'Erro inesperado.',
      });
    },
  });

  const test = useMutation({
    mutationFn: () =>
      api.testConnection(secrets.apiKey || undefined, secrets.apiSecret || undefined),
    onSuccess: (result) => {
      setTestResult(result);
      toast.success('Conexão validada', {
        description: `${fmtMoney(result.equity)} de equity · modo ${result.positionMode === 2 ? 'one-way' : 'hedge'}`,
      });
    },
    onError: (error) => {
      setTestResult(null);
      toast.error('Falha na conexão', {
        description:
          error instanceof ApiError
            ? error.message
            : 'Verifique as credenciais e a whitelist de IP.',
      });
    },
  });

  const killSwitch = useMutation({
    mutationFn: (enabled: boolean) => api.setKillSwitch(enabled),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data);
      setDraft((current) =>
        current
          ? {
              ...current,
              execution: { ...current.execution, killSwitch: data.config.execution.killSwitch },
            }
          : current,
      );
      toast.warning(
        data.config.execution.killSwitch ? 'Kill switch ativado' : 'Kill switch liberado',
        {
          description: data.config.execution.killSwitch
            ? 'O bot foi parado e novas entradas estão bloqueadas.'
            : 'O bot pode ser iniciado novamente.',
        },
      );
    },
    onError: (error) =>
      toast.error('Falha ao alterar kill switch', {
        description: error instanceof ApiError ? error.message : 'Erro inesperado.',
      }),
  });

  if (settings.isLoading || !draft) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-4 xl:grid-cols-[220px_1fr]">
          <Skeleton className="h-72" />
          <div className="space-y-4">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  const errorFor = (path: string): string | undefined => {
    if (!showErrors || !validation || validation.success) return undefined;
    return validation.error.issues.find((issue) => issue.path.join('.') === path)?.message;
  };

  const update = <K extends keyof BotConfig>(key: K, value: BotConfig[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const updateSection = <
    K extends 'paper' | 'risk' | 'daily' | 'strategy' | 'execution' | 'notifications',
  >(
    key: K,
    patch: Partial<BotConfig[K]>,
  ) => {
    setDraft((current) =>
      current ? ({ ...current, [key]: { ...current[key], ...patch } } as BotConfig) : current,
    );
  };

  const contractMaxLeverage = contract.data?.contract?.maxLeverage ?? 125;
  const feesBps = (draft.execution.feeMaker + draft.execution.feeTaker) * 10_000;
  const netTakeProfit = draft.strategy.takeProfitBps - feesBps;
  const riskPerTrade = (draft.paper.startingBalance * draft.risk.riskPerTradePct) / 100;
  const maxNotional = Math.min(
    draft.risk.maxNotionalUsd,
    draft.risk.maxMarginPerTradeUsd * draft.leverage,
    draft.paper.startingBalance * draft.leverage * 0.8,
  );
  const riskAtStop = (maxNotional * draft.strategy.stopLossBps) / 10_000;
  const dailyRatio =
    draft.daily.lossLimitUsd > 0 ? draft.daily.profitTargetUsd / draft.daily.lossLimitUsd : 0;
  const settingsSource = settings.data?.secrets.credentialSource ?? 'none';

  return (
    <div className="space-y-4 pb-24" data-testid="settings-page">
      <Card className="relative overflow-hidden">
        <div className="bg-acid/5 pointer-events-none absolute -top-20 right-0 h-48 w-48 rounded-full blur-3xl" />
        <CardBody className="relative flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="label">Configuração do motor</p>
            <h2 className="text-ink mt-1 text-lg font-semibold tracking-tight">
              {draft.mode === 'live' ? 'Trading real' : 'Paper trading'} · {draft.primarySymbol} ·{' '}
              {draft.leverage}x
            </h2>
            <p className="text-muted mt-1 text-xs">
              Risco {draft.risk.riskPerTradePct}% por trade · meta{' '}
              {fmtMoney(draft.daily.profitTargetUsd)} · stop {fmtMoney(draft.daily.lossLimitUsd)} ·{' '}
              {draft.strategy.entryStyle === 'maker' ? 'maker-first' : 'taker'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={settingsSource === 'none' ? 'warn' : 'profit'} dot>
              {settingsSource === 'none' ? 'sem API key' : `API via ${settingsSource}`}
            </Badge>
            <Badge variant={draft.execution.killSwitch ? 'loss' : 'neutral'} dot>
              kill switch {draft.execution.killSwitch ? 'on' : 'off'}
            </Badge>
            {dirty ? (
              <Badge variant="warn">alterações não salvas</Badge>
            ) : (
              <Badge variant="neutral">synced</Badge>
            )}
          </div>
        </CardBody>
      </Card>

      {running ? (
        <div className="border-warn/25 bg-warn/10 text-warn flex items-start gap-2 rounded-xl border px-4 py-3 text-[11px]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />O bot está em execução. Pare o bot
          para salvar alterações de configuração.
        </div>
      ) : null}
      {!validation?.success ? (
        <div className="border-loss/25 bg-loss/5 text-loss rounded-xl border px-4 py-3 text-[11px]">
          Configuração inválida: {validation?.error.issues[0]?.message ?? 'revise os campos'}. O
          botão salvar fica bloqueado.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <nav className="sticky top-24 space-y-1">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="text-muted hover:bg-panel-2 hover:text-ink flex items-center gap-2.5 rounded-lg px-3 py-2 text-[11px] transition-colors"
              >
                <section.icon className="h-3.5 w-3.5" />
                {section.label}
              </a>
            ))}
            <div className="border-line bg-panel/60 text-dim mt-4 rounded-xl border p-3 text-[10px] leading-relaxed">
              Segredos são criptografados com AES-256-GCM e nunca retornam para o navegador.
            </div>
          </nav>
        </aside>

        <div className="min-w-0 space-y-4">
          <Section
            id="connection"
            title="Conexão MEXC"
            description="Credenciais de futuros. Crie uma API key somente com permissão de leitura e trade, sem saque."
            icon={<PlugZap className="h-4 w-4" />}
            action={
              <Badge variant={settingsSource === 'none' ? 'warn' : 'profit'}>
                {settingsSource === 'none'
                  ? 'não configurada'
                  : settingsSource === 'env'
                    ? 'via ambiente'
                    : 'salva e criptografada'}
              </Badge>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="API key"
                htmlFor="apiKey"
                hint={
                  settings.data?.secrets.hasApiKey
                    ? `Configurada: ${settings.data.secrets.apiKeyMasked}`
                    : 'Cole a API key da MEXC Futures.'
                }
                error={errorFor('apiKey')}
              >
                <Input
                  id="apiKey"
                  value={secrets.apiKey}
                  onChange={(event) =>
                    setSecrets((current) => ({ ...current, apiKey: event.target.value }))
                  }
                  placeholder={
                    settings.data?.secrets.hasApiKey
                      ? '•••••••••••• (deixe vazio para manter)'
                      : 'mx...'
                  }
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field
                label="API secret"
                htmlFor="apiSecret"
                hint="A secret só é enviada no save; depois fica mascarada."
              >
                <Input
                  id="apiSecret"
                  type="password"
                  value={secrets.apiSecret}
                  onChange={(event) =>
                    setSecrets((current) => ({ ...current, apiSecret: event.target.value }))
                  }
                  placeholder={
                    settings.data?.secrets.hasApiKey
                      ? '•••••••••••• (deixe vazio para manter)'
                      : 'secret'
                  }
                  autoComplete="new-password"
                />
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                leftIcon={<PlugZap className="h-4 w-4" />}
                loading={test.isPending}
                disabled={Boolean(secrets.apiKey) !== Boolean(secrets.apiSecret)}
                onClick={() => test.mutate()}
              >
                Testar conexão
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                rightIcon={<ExternalLink className="h-3.5 w-3.5" />}
              >
                <a href="https://www.mexc.com/ucenter/openapi" target="_blank" rel="noreferrer">
                  Abrir MEXC API
                </a>
              </Button>
              <span className="text-dim text-[10px]">
                Preencha key + secret juntas para rotacionar. Deixe ambas vazias para manter.
              </span>
            </div>

            {testResult ? (
              <div className="border-profit/20 bg-profit/5 mt-4 grid gap-2 rounded-xl border p-3 sm:grid-cols-4">
                <ResultItem label="Equity" value={fmtMoney(testResult.equity)} />
                <ResultItem label="Disponível" value={fmtMoney(testResult.availableBalance)} />
                <ResultItem
                  label="Posição"
                  value={testResult.positionMode === 2 ? 'one-way' : 'hedge'}
                />
                <ResultItem label="Clock offset" value={`${testResult.offsetMs}ms`} />
              </div>
            ) : null}

            <div className="border-line mt-4 space-y-3 border-t pt-4">
              <Checkbox
                label="Remover credenciais salvas"
                description="Apaga key e secret do banco. A env MEXC_API_KEY/SECRET, se existir, continua valendo."
                checked={secrets.clearApi}
                onChange={(checked) => setSecrets((current) => ({ ...current, clearApi: checked }))}
              />
              <div className="text-dim grid gap-2 text-[10px] leading-relaxed sm:grid-cols-2">
                <SecurityItem text="Use somente permissões de leitura + negociação; nunca habilite saque." />
                <SecurityItem text="Cadastre IP whitelist da VPS e mantenha a secret fora do git." />
                <SecurityItem text="A conta precisa estar em modo one-way para o motor operar." />
                <SecurityItem text="Teste o modo paper antes de habilitar LIVE_TRADING_ENABLED." />
              </div>
            </div>
          </Section>

          <Section
            id="mode"
            title="Modo & contrato"
            description="O motor opera um contrato por vez. A watchlist é usada para o seletor do terminal."
            icon={<SlidersHorizontal className="h-4 w-4" />}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Modo de execução"
                hint="Live exige LIVE_TRADING_ENABLED=true e confirmação explícita no start."
              >
                <SegmentedControl
                  value={draft.mode}
                  onChange={(value) => update('mode', value)}
                  options={[
                    { value: 'paper', label: 'Paper' },
                    { value: 'live', label: 'Real' },
                  ]}
                />
              </Field>
              <Field label="Margin mode" htmlFor="marginMode">
                <Select
                  id="marginMode"
                  value={draft.marginMode}
                  onChange={(event) =>
                    update('marginMode', event.target.value as BotConfig['marginMode'])
                  }
                >
                  <option value="isolated">Isolated</option>
                  <option value="cross">Cross</option>
                </Select>
              </Field>
              <Field
                label="Símbolo principal"
                htmlFor="primarySymbol"
                error={errorFor('primarySymbol')}
              >
                <Input
                  id="primarySymbol"
                  value={draft.primarySymbol}
                  onChange={(event) => update('primarySymbol', event.target.value.toUpperCase())}
                  list="symbol-suggestions"
                  spellCheck={false}
                />
                <datalist id="symbol-suggestions">
                  <option value="BTC_USDT" />
                  <option value="ETH_USDT" />
                  <option value="SOL_USDT" />
                  <option value="XRP_USDT" />
                </datalist>
              </Field>
              <Field
                label="Watchlist"
                htmlFor="watchlist"
                hint="Separe por vírgula. O principal é adicionado automaticamente."
                error={errorFor('watchlist')}
              >
                <Input
                  id="watchlist"
                  value={watchlistInput}
                  onChange={(event) => setWatchlistInput(event.target.value.toUpperCase())}
                  placeholder="BTC_USDT, ETH_USDT"
                  spellCheck={false}
                />
              </Field>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                label={`Alavancagem: ${draft.leverage}x`}
                hint={`Contrato aceita até ${contractMaxLeverage}x. Alavancagem alta aumenta liquidação e slippage.`}
                error={errorFor('leverage')}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={contractMaxLeverage}
                    value={draft.leverage}
                    onChange={(event) => update('leverage', Number(event.target.value))}
                    className="h-1.5 w-full cursor-pointer accent-[#c9f73a]"
                    aria-label="Alavancagem"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={contractMaxLeverage}
                    value={draft.leverage}
                    onChange={(event) => update('leverage', Number(event.target.value))}
                    className="w-20 text-right"
                  />
                </div>
              </Field>
              <div className="border-line bg-panel-2/50 rounded-xl border p-3">
                <p className="label">Contrato MEXC</p>
                {contract.data?.contract ? (
                  <div className="text-muted mt-2 grid grid-cols-2 gap-2 text-[10px]">
                    <span>max {contract.data.contract.maxLeverage}x</span>
                    <span>min vol {contract.data.contract.minVol}</span>
                    <span>maker {(contract.data.contract.makerFeeRate * 100).toFixed(3)}%</span>
                    <span>taker {(contract.data.contract.takerFeeRate * 100).toFixed(3)}%</span>
                  </div>
                ) : (
                  <p className="text-dim mt-2 text-[10px]">
                    Metadados indisponíveis offline; fallback paper ativo.
                  </p>
                )}
                <p className="text-dim mt-2 text-[9px]">
                  source: {contract.data?.source ?? '...'} · min notional ~{' '}
                  {contract.data?.contract
                    ? fmtMoney(
                        contract.data.contract.minVol *
                          contract.data.contract.contractSize *
                          100_000,
                      )
                    : '—'}
                </p>
              </div>
            </div>

            <div className="border-line mt-4 grid gap-4 border-t pt-4 sm:grid-cols-3">
              <Field
                label="Feed paper"
                htmlFor="feed"
                hint="Sintético funciona offline; MEXC usa mercado real."
              >
                <Select
                  id="feed"
                  value={draft.paper.feed}
                  onChange={(event) =>
                    updateSection('paper', { feed: event.target.value as 'synthetic' | 'mexc' })
                  }
                >
                  <option value="synthetic">Sintético</option>
                  <option value="mexc">MEXC público</option>
                </Select>
              </Field>
              <Field
                label="Saldo paper"
                htmlFor="startingBalance"
                hint="Equity inicial do simulador."
              >
                <Input
                  id="startingBalance"
                  type="number"
                  min={10}
                  step={10}
                  value={draft.paper.startingBalance}
                  onChange={(event) =>
                    updateSection('paper', { startingBalance: Number(event.target.value) })
                  }
                />
              </Field>
              <Field
                label="Seed do feed"
                htmlFor="seed"
                hint="Determinístico para reproduzir cenários."
              >
                <Input
                  id="seed"
                  type="number"
                  value={draft.paper.seed}
                  onChange={(event) => updateSection('paper', { seed: Number(event.target.value) })}
                />
              </Field>
            </div>
          </Section>

          <Section
            id="strategy"
            title="Estratégia"
            description="Scalp de momentum com confirmação de order flow. Entradas rápidas, saídas com TP/SL/trailing."
            icon={<Zap className="h-4 w-4" />}
            action={<Badge variant="accent">momentum + flow</Badge>}
          >
            <div className="border-line bg-panel-2/50 text-dim mb-4 rounded-xl border p-3 text-[10px] leading-relaxed">
              O sinal só dispara quando a EMA rápida cruza a lenta por X bps, o book tem
              desequilíbrio na mesma direção e o delta de agressão confirma. Maker-first tenta
              entrar no bid/ask e cai para taker após timeout, se habilitado.
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Estilo de entrada">
                <SegmentedControl
                  value={draft.strategy.entryStyle}
                  onChange={(value) => updateSection('strategy', { entryStyle: value })}
                  options={[
                    { value: 'maker', label: 'Maker-first' },
                    { value: 'taker', label: 'Taker' },
                  ]}
                />
              </Field>
              <NumberField
                label="EMA rápida"
                value={draft.strategy.fastEma}
                onChange={(value) => updateSection('strategy', { fastEma: value })}
                error={errorFor('strategy.fastEma')}
              />
              <NumberField
                label="EMA lenta"
                value={draft.strategy.slowEma}
                onChange={(value) => updateSection('strategy', { slowEma: value })}
                error={errorFor('strategy.slowEma')}
              />
              <NumberField
                label="Threshold trend (bps)"
                value={draft.strategy.entryThresholdBps}
                step={0.1}
                onChange={(value) => updateSection('strategy', { entryThresholdBps: value })}
              />
              <NumberField
                label="Imbalance mínimo"
                value={draft.strategy.imbalanceThreshold}
                step={0.05}
                onChange={(value) => updateSection('strategy', { imbalanceThreshold: value })}
              />
              <NumberField
                label="Trade delta mínimo"
                value={draft.strategy.tradeDeltaThreshold}
                step={0.05}
                onChange={(value) => updateSection('strategy', { tradeDeltaThreshold: value })}
              />
              <NumberField
                label="Take profit (bps)"
                value={draft.strategy.takeProfitBps}
                onChange={(value) => updateSection('strategy', { takeProfitBps: value })}
                error={errorFor('strategy.takeProfitBps')}
              />
              <NumberField
                label="Stop loss (bps)"
                value={draft.strategy.stopLossBps}
                onChange={(value) => updateSection('strategy', { stopLossBps: value })}
                error={errorFor('strategy.stopLossBps')}
              />
              <NumberField
                label="Trailing start (bps)"
                value={draft.strategy.trailingStartBps}
                onChange={(value) => updateSection('strategy', { trailingStartBps: value })}
                error={errorFor('strategy.trailingStartBps')}
              />
              <NumberField
                label="Trailing distância (bps)"
                value={draft.strategy.trailingDistanceBps}
                onChange={(value) => updateSection('strategy', { trailingDistanceBps: value })}
                error={errorFor('strategy.trailingDistanceBps')}
              />
              <NumberField
                label="Time stop (s)"
                value={draft.strategy.timeStopSec}
                onChange={(value) => updateSection('strategy', { timeStopSec: value })}
              />
              <NumberField
                label="Cooldown (ms)"
                value={draft.strategy.cooldownMs}
                step={100}
                onChange={(value) => updateSection('strategy', { cooldownMs: value })}
              />
              <NumberField
                label="Hold mínimo (ms)"
                value={draft.strategy.minHoldMs}
                step={100}
                onChange={(value) => updateSection('strategy', { minHoldMs: value })}
              />
              <NumberField
                label="Timeout maker (ms)"
                value={draft.strategy.makerTimeoutMs}
                step={100}
                onChange={(value) => updateSection('strategy', { makerTimeoutMs: value })}
              />
              <NumberField
                label="Requotes máximos"
                value={draft.strategy.maxRequotes}
                step={1}
                onChange={(value) => updateSection('strategy', { maxRequotes: value })}
              />
              <NumberField
                label="Intervalo entre requotes (ms)"
                value={draft.strategy.requoteAfterMs}
                step={100}
                onChange={(value) => updateSection('strategy', { requoteAfterMs: value })}
              />
              <NumberField
                label="Movimento mínimo p/ requote (bps)"
                value={draft.strategy.requoteMinMoveBps}
                step={0.5}
                onChange={(value) => updateSection('strategy', { requoteMinMoveBps: value })}
              />
              <NumberField
                label="Slippage máx. (bps)"
                value={draft.strategy.maxSlippageBps}
                onChange={(value) => updateSection('strategy', { maxSlippageBps: value })}
              />
              <div className="flex items-end">
                <div className="border-line bg-panel-2/60 w-full rounded-xl border p-3">
                  <Switch
                    checked={draft.strategy.allowTakerFallback}
                    onChange={(checked) =>
                      updateSection('strategy', { allowTakerFallback: checked })
                    }
                    label="Fallback taker"
                    description="Se o maker não preencher no timeout, entra a mercado."
                  />
                </div>
              </div>
            </div>
          </Section>

          <Section
            id="risk"
            title="Risco por trade"
            description="O risk guard calcula tamanho pelo stop, pelo notional e pela margem disponível."
            icon={<ShieldAlert className="h-4 w-4" />}
            action={<Badge variant="warn">limites duros</Badge>}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                label="Risco por trade (%)"
                value={draft.risk.riskPerTradePct}
                step={0.05}
                onChange={(value) => updateSection('risk', { riskPerTradePct: value })}
                error={errorFor('risk.riskPerTradePct')}
              />
              <NumberField
                label="Notional máximo (USDT)"
                value={draft.risk.maxNotionalUsd}
                step={10}
                onChange={(value) => updateSection('risk', { maxNotionalUsd: value })}
                error={errorFor('risk.maxNotionalUsd')}
              />
              <NumberField
                label="Margem máx. por trade"
                value={draft.risk.maxMarginPerTradeUsd}
                step={5}
                onChange={(value) => updateSection('risk', { maxMarginPerTradeUsd: value })}
              />
              <NumberField
                label="Trades por dia"
                value={draft.risk.maxTradesPerDay}
                onChange={(value) => updateSection('risk', { maxTradesPerDay: value })}
              />
              <NumberField
                label="Ordens por minuto"
                value={draft.risk.maxOrdersPerMinute}
                onChange={(value) => updateSection('risk', { maxOrdersPerMinute: value })}
              />
              <NumberField
                label="Perdas consecutivas"
                value={draft.risk.maxConsecutiveLosses}
                onChange={(value) => updateSection('risk', { maxConsecutiveLosses: value })}
              />
              <NumberField
                label="Cooldown pós-loss (s)"
                value={draft.risk.cooldownAfterLossSec}
                onChange={(value) => updateSection('risk', { cooldownAfterLossSec: value })}
              />
              <NumberField
                label="Spread máximo (bps)"
                value={draft.risk.maxSpreadBps}
                step={0.5}
                onChange={(value) => updateSection('risk', { maxSpreadBps: value })}
              />
              <NumberField
                label="Equity mínimo (USDT)"
                value={draft.risk.minEquityUsd}
                onChange={(value) => updateSection('risk', { minEquityUsd: value })}
              />
            </div>

            <div className="border-line bg-panel-2/50 mt-4 grid gap-2 rounded-xl border p-3 sm:grid-cols-3">
              <Preview
                label="Risco orçado"
                value={fmtMoney(riskPerTrade)}
                hint="saldo paper × risco%"
              />
              <Preview
                label="Notional efetivo"
                value={fmtMoney(maxNotional)}
                hint="mínimo entre caps"
              />
              <Preview
                label="Risco no stop"
                value={fmtMoney(riskAtStop)}
                hint="notional × stop bps"
              />
            </div>
            <p className="text-dim mt-2 text-[10px]">
              O risco real é limitado também pela margem disponível e pelo valor mínimo do contrato.
              Se o mínimo do contrato exceder o orçamento, a entrada é bloqueada — não arredondada
              para cima.
            </p>
          </Section>

          <Section
            id="daily"
            title="Guard diário"
            description="O bot para sozinho ao atingir a meta ou o limite de perda. O reset respeita o horário UTC."
            icon={<Target className="h-4 w-4" />}
            action={
              <Badge variant={dailyRatio >= 1 ? 'profit' : 'warn'}>
                R:R alvo {dailyRatio.toFixed(2)}x
              </Badge>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Meta de lucro diário (USDT)"
                value={draft.daily.profitTargetUsd}
                step={5}
                onChange={(value) => updateSection('daily', { profitTargetUsd: value })}
                error={errorFor('daily.profitTargetUsd')}
                testId="daily-profit-target"
              />
              <NumberField
                label="Stop de perda diário (USDT)"
                value={draft.daily.lossLimitUsd}
                step={5}
                onChange={(value) => updateSection('daily', { lossLimitUsd: value })}
                error={errorFor('daily.lossLimitUsd')}
              />
              <Field
                label="Reset UTC"
                htmlFor="resetHour"
                hint="0 = meia-noite UTC. Não usa fuso local."
              >
                <Select
                  id="resetHour"
                  value={String(draft.daily.resetHourUtc)}
                  onChange={(event) =>
                    updateSection('daily', { resetHourUtc: Number(event.target.value) })
                  }
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>
                      {String(hour).padStart(2, '0')}:00 UTC
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="border-line bg-panel-2/50 space-y-2 rounded-xl border px-3 py-1">
                <Switch
                  checked={draft.daily.stopOnTarget}
                  onChange={(checked) => updateSection('daily', { stopOnTarget: checked })}
                  label="Parar ao atingir a meta"
                  description="Evita devolver o lucro do dia. Recomendado."
                />
                <div className="hairline" />
                <Switch
                  checked={draft.daily.closeOnStop}
                  onChange={(checked) => updateSection('daily', { closeOnStop: checked })}
                  label="Fechar posição no guard"
                  description="Ao pausar por meta, tenta fechar a posição a mercado."
                />
              </div>
            </div>
            <div className="border-line bg-panel-2/50 text-dim mt-4 rounded-xl border p-3 text-[10px] leading-relaxed">
              Exemplo: saldo {fmtMoney(draft.paper.startingBalance)}, risco{' '}
              {draft.risk.riskPerTradePct}% e stop de {draft.strategy.stopLossBps} bps. A meta de{' '}
              {fmtMoney(draft.daily.profitTargetUsd)} só é considerada realizada após as taxas e o
              stop limita a perda a {fmtMoney(draft.daily.lossLimitUsd)}.
            </div>
          </Section>

          <Section
            id="execution"
            title="Execução & taxas"
            description="A taxa taker da MEXC corrói scalps. O validador exige TP acima do round-trip + 2 bps."
            icon={<Gauge className="h-4 w-4" />}
            action={
              <Badge variant={netTakeProfit > 0 ? 'profit' : 'loss'}>
                TP líquido {fmtBps(netTakeProfit)}
              </Badge>
            }
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                label="Fee maker"
                value={draft.execution.feeMaker}
                step={0.0001}
                onChange={(value) => updateSection('execution', { feeMaker: value })}
                error={errorFor('execution.feeMaker')}
              />
              <NumberField
                label="Fee taker"
                value={draft.execution.feeTaker}
                step={0.0001}
                onChange={(value) => updateSection('execution', { feeTaker: value })}
                error={errorFor('execution.feeTaker')}
              />
              <NumberField
                label="Slippage (bps)"
                value={draft.execution.slippageBps}
                step={0.5}
                onChange={(value) => updateSection('execution', { slippageBps: value })}
              />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Preview label="Round-trip fee" value={fmtBps(feesBps)} hint="maker + taker" />
              <Preview
                label="TP bruto"
                value={fmtBps(draft.strategy.takeProfitBps)}
                hint="antes das taxas"
              />
              <Preview
                label="TP líquido"
                value={fmtBps(netTakeProfit)}
                hint="após round-trip"
                tone={netTakeProfit > 0 ? 'profit' : 'loss'}
              />
            </div>
            <div className="border-line bg-panel-2/50 mt-4 rounded-xl border px-3 py-2">
              <Switch
                checked={draft.execution.killSwitch}
                onChange={(checked) => {
                  if (checked) setKillConfirm(true);
                  else killSwitch.mutate(false);
                }}
                label="Kill switch"
                description="Bloqueia novas entradas e força a parada do bot. Pode ser acionado no topo do dashboard."
              />
            </div>
          </Section>

          <Section
            id="notifications"
            title="Notificações"
            description="Alertas de trade e halt via Telegram ou webhook. Tokens são criptografados."
            icon={<Bell className="h-4 w-4" />}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Telegram chat ID"
                htmlFor="telegramChatId"
                hint="Use @userinfobot para descobrir seu chat id."
              >
                <Input
                  id="telegramChatId"
                  value={draft.notifications.telegramChatId}
                  onChange={(event) =>
                    updateSection('notifications', { telegramChatId: event.target.value })
                  }
                  placeholder="123456789"
                />
              </Field>
              <Field
                label="Telegram bot token"
                htmlFor="telegramToken"
                hint={
                  settings.data?.secrets.hasTelegramToken
                    ? 'Token já configurado; deixe vazio para manter.'
                    : 'Crie um bot no @BotFather.'
                }
              >
                <Input
                  id="telegramToken"
                  type="password"
                  value={secrets.telegramToken}
                  onChange={(event) =>
                    setSecrets((current) => ({ ...current, telegramToken: event.target.value }))
                  }
                  placeholder={
                    settings.data?.secrets.hasTelegramToken ? '••••••••' : '123456:ABC...'
                  }
                  autoComplete="new-password"
                />
              </Field>
              <Field
                label="Webhook URL"
                htmlFor="webhookUrl"
                hint="POST JSON com { text, source }."
                optional
              >
                <Input
                  id="webhookUrl"
                  value={draft.notifications.webhookUrl}
                  onChange={(event) =>
                    updateSection('notifications', { webhookUrl: event.target.value })
                  }
                  placeholder="https://..."
                />
              </Field>
              <div className="border-line bg-panel-2/50 space-y-2 rounded-xl border px-3 py-1">
                <Switch
                  checked={draft.notifications.telegramEnabled}
                  onChange={(checked) =>
                    updateSection('notifications', { telegramEnabled: checked })
                  }
                  label="Telegram ativo"
                  description="Requer chat id + token."
                />
                <div className="hairline" />
                <Switch
                  checked={draft.notifications.notifyOnTrade}
                  onChange={(checked) => updateSection('notifications', { notifyOnTrade: checked })}
                  label="Notificar trades"
                />
                <div className="hairline" />
                <Switch
                  checked={draft.notifications.notifyOnHalt}
                  onChange={(checked) => updateSection('notifications', { notifyOnHalt: checked })}
                  label="Notificar halts"
                />
              </div>
            </div>
            <div className="mt-3">
              <Checkbox
                label="Remover token do Telegram"
                checked={secrets.clearTelegram}
                onChange={(checked) =>
                  setSecrets((current) => ({ ...current, clearTelegram: checked }))
                }
              />
            </div>
          </Section>

          <Section
            id="live"
            title="Live & segurança"
            description="Duas travas independentes protegem o dinheiro real."
            icon={<LockKeyhole className="h-4 w-4" />}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="border-line bg-panel-2/50 rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-ink text-xs font-medium">Live trading no servidor</p>
                  <Badge variant={settings.data?.liveTradingEnabled ? 'profit' : 'warn'}>
                    {settings.data?.liveTradingEnabled ? 'habilitado' : 'desabilitado'}
                  </Badge>
                </div>
                <p className="text-dim mt-2 text-[10px] leading-relaxed">
                  Controlado por <span className="num text-muted">LIVE_TRADING_ENABLED</span> no
                  ambiente. Mesmo com o modo Real selecionado, o start falha se a flag estiver
                  false.
                </p>
              </div>
              <div className="border-line bg-panel-2/50 rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-ink text-xs font-medium">Frase de confirmação</p>
                  <Badge variant="loss">obrigatória</Badge>
                </div>
                <p className="num text-warn mt-2 text-xs">{settings.data?.confirmationPhrase}</p>
                <p className="text-dim mt-1 text-[10px]">
                  Digitada no dialog de start, nunca armazenada.
                </p>
              </div>
              <div className="border-line bg-panel-2/50 rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-ink text-xs font-medium">Senha do dashboard</p>
                  <Badge variant={settings.data?.authRequired ? 'profit' : 'warn'}>
                    {settings.data?.authRequired ? 'ativa' : 'sem senha'}
                  </Badge>
                </div>
                <p className="text-dim mt-2 text-[10px] leading-relaxed">
                  Defina <span className="num text-muted">AUTH_PASSWORD</span> e reinicie. Sessão
                  HttpOnly, SameSite Strict e rate limit no login.
                </p>
              </div>
              <div className="border-loss/20 bg-loss/5 rounded-xl border p-3">
                <div className="text-loss flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" />
                  <p className="text-xs font-medium">Risco real</p>
                </div>
                <p className="text-loss/80 mt-2 text-[10px] leading-relaxed">
                  Alavancagem, taxa de funding, liquidação e slippage podem causar perda total da
                  margem. Nenhum bot garante lucro. Comece com notional mínimo.
                </p>
              </div>
            </div>
            <div className="text-dim mt-4 flex flex-wrap items-center gap-2 text-[10px]">
              <CheckCircle2 className="text-profit h-3.5 w-3.5" />
              Segredos criptografados · audit log · risk guard server-side · confirmação dupla para
              live
            </div>
          </Section>
        </div>
      </div>

      <div className="border-line bg-void/90 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1640px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 text-[11px]">
            {dirty ? (
              <>
                <span className="bg-warn h-1.5 w-1.5 rounded-full" />
                <span className="text-warn">Alterações não salvas</span>
              </>
            ) : (
              <>
                <span className="bg-profit h-1.5 w-1.5 rounded-full" />
                <span className="text-dim">Tudo sincronizado</span>
              </>
            )}
            {!validation?.success ? (
              <span className="text-loss">· configuração inválida</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={() => {
                if (!settings.data) return;
                setDraft(settings.data.config);
                setWatchlistInput(settings.data.config.watchlist.join(', '));
                setSecrets(EMPTY_SECRETS);
                setShowErrors(false);
              }}
              disabled={!dirty}
            >
              Descartar
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Save className="h-3.5 w-3.5" />}
              loading={save.isPending}
              disabled={!dirty || !validation?.success || running}
              onClick={() => save.mutate()}
              data-testid="save-settings"
            >
              Salvar alterações
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={killConfirm}
        onOpenChange={setKillConfirm}
        title="Ativar kill switch?"
        description="O bot ser? parado imediatamente, ordens pendentes ser?o canceladas e a posi??o ser? fechada a mercado quando poss?vel. Para voltar, desative o kill switch e reinicie."
        confirmLabel="Ativar kill switch"
        loading={killSwitch.isPending}
        onConfirm={() => {
          setKillConfirm(false);
          killSwitch.mutate(true);
        }}
      />
    </div>
  );
}

function Section({
  id,
  title,
  description,
  icon,
  action,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader
        title={title}
        description={description}
        eyebrow="Settings"
        icon={icon}
        action={action}
      />
      <CardBody className="pt-4">{children}</CardBody>
    </Card>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  error,
  testId,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  error?: string;
  testId?: string;
}) {
  return (
    <Field label={label} error={error}>
      <Input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(event) => onChange(Number(event.target.value))}
        className="text-right"
        data-testid={testId}
      />
    </Field>
  );
}

function Preview({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'neutral' | 'profit' | 'loss';
}) {
  return (
    <div>
      <p className="text-dim text-[9px] uppercase tracking-wider">{label}</p>
      <p
        className={cn(
          'num mt-0.5 text-xs font-semibold',
          tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-ink',
        )}
      >
        {value}
      </p>
      <p className="text-dim text-[9px]">{hint}</p>
    </div>
  );
}

function ResultItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-dim text-[9px] uppercase tracking-wider">{label}</p>
      <p className="num text-ink mt-0.5 text-xs font-semibold">{value}</p>
    </div>
  );
}

function SecurityItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <ShieldCheck className="text-acid mt-0.5 h-3 w-3 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
