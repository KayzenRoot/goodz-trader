import { Activity, Filter, ScrollText, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAudit, useLogs } from '@/hooks/useTrader';
import { fmtDateTime, fmtTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useLiveStore } from '@/store/live';

export function LogsPage() {
  const [level, setLevel] = useState('');
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState(200);
  const logs = useLogs({
    level: level || undefined,
    category: category.trim() || undefined,
    limit,
  });
  const audit = useAudit(150);
  const connected = useLiveStore((state) => state.connected);

  return (
    <Tabs defaultValue="logs" className="space-y-4" data-testid="logs-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">Observabilidade</p>
          <h2 className="text-ink mt-1 text-lg font-semibold tracking-tight">
            Tudo que o motor fez, e por quê
          </h2>
          <p className="text-muted mt-1 text-xs">
            Logs estruturados, stream em tempo real e trilha de auditoria imutável no SQLite.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={connected ? 'profit' : 'warn'} dot>
            {connected ? 'stream online' : 'polling'}
          </Badge>
          <TabsList className="border-b-0">
            <TabsTrigger value="logs">
              <ScrollText className="h-3.5 w-3.5" /> Logs
            </TabsTrigger>
            <TabsTrigger value="audit">
              <ShieldCheck className="h-3.5 w-3.5" /> Auditoria
            </TabsTrigger>
          </TabsList>
        </div>
      </div>

      <TabsContent value="logs">
        <Card>
          <CardHeader
            title="Event stream"
            description="Mais recentes primeiro. O stream usa o WebSocket do dashboard."
            eyebrow="Runtime"
            icon={<Activity className="h-4 w-4" />}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="text-dim h-3.5 w-3.5" />
                <Select
                  value={level}
                  onChange={(event) => setLevel(event.target.value)}
                  className="h-8 w-28 text-xs"
                  aria-label="Filtrar nível"
                >
                  <option value="">Todos níveis</option>
                  <option value="debug">debug</option>
                  <option value="info">info</option>
                  <option value="warn">warn</option>
                  <option value="error">error</option>
                </Select>
                <input
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="categoria"
                  className="border-line-strong bg-panel-2 text-ink placeholder:text-dim focus:border-acid/60 h-8 w-32 rounded-lg border px-2.5 text-xs focus:outline-none"
                  aria-label="Filtrar categoria"
                />
                <Select
                  value={String(limit)}
                  onChange={(event) => setLimit(Number(event.target.value))}
                  className="h-8 w-24 text-xs"
                  aria-label="Limite de logs"
                >
                  <option value="100">100</option>
                  <option value="200">200</option>
                  <option value="500">500</option>
                </Select>
              </div>
            }
          />
          <CardBody className="pt-3">
            {logs.length === 0 ? (
              <p className="text-dim py-10 text-center text-xs">Nenhum log com esses filtros.</p>
            ) : (
              <div className="scroll-thin max-h-[calc(100vh-330px)] space-y-0.5 overflow-y-auto font-mono text-[10px]">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="hover:bg-panel-2/60 grid grid-cols-[70px_48px_88px_1fr] gap-2 rounded-md px-1.5 py-1.5"
                  >
                    <span className="text-dim">{fmtTime(log.ts)}</span>
                    <span
                      className={cn(
                        'uppercase',
                        log.level === 'error'
                          ? 'text-loss'
                          : log.level === 'warn'
                            ? 'text-warn'
                            : log.level === 'debug'
                              ? 'text-dim'
                              : 'text-info',
                      )}
                    >
                      {log.level}
                    </span>
                    <span className="text-dim truncate">[{log.category}]</span>
                    <div className="text-muted min-w-0">
                      <span className="break-words">{log.message}</span>
                      {log.data ? (
                        <details className="mt-0.5">
                          <summary className="text-dim hover:text-muted cursor-pointer text-[9px]">
                            payload
                          </summary>
                          <pre className="text-dim mt-1 max-h-32 overflow-auto rounded bg-black/30 p-2 text-[9px]">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </TabsContent>

      <TabsContent value="audit">
        <Card>
          <CardHeader
            title="Trilha de auditoria"
            description="Mudanças de configuração, login, start/stop e kill switch."
            eyebrow="Compliance"
            icon={<ShieldCheck className="h-4 w-4" />}
          />
          <CardBody className="px-0 pb-0 pt-3">
            {audit.isLoading ? (
              <div className="space-y-2 px-5 pb-5">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-10" />
                ))}
              </div>
            ) : audit.data?.items.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Quando</TH>
                    <TH>Ator</TH>
                    <TH>Ação</TH>
                    <TH>Detalhe</TH>
                    <TH>IP</TH>
                  </TR>
                </THead>
                <TBody>
                  {audit.data.items.map((entry) => (
                    <TR key={entry.id}>
                      <TD className="num text-dim whitespace-nowrap">{fmtDateTime(entry.ts)}</TD>
                      <TD className="text-ink">{entry.actor}</TD>
                      <TD>
                        <Badge variant="neutral">{entry.action}</Badge>
                      </TD>
                      <TD className="max-w-md truncate font-mono text-[10px]">{entry.detail}</TD>
                      <TD className="num text-dim">{entry.ip ?? '—'}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <p className="text-dim px-5 py-10 text-center text-xs">Sem eventos de auditoria.</p>
            )}
          </CardBody>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
