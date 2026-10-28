import type { BotConfig, EngineStatus } from '@goodz/core';
import { AlertTriangle, BellRing, CheckCircle2, Info, OctagonAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { buildOperationalAlerts, type AlertSeverity } from '@/lib/alerts';
import { cn } from '@/lib/utils';

const severityStyles: Record<AlertSeverity, string> = {
  critical: 'border-loss/30 bg-loss/8 text-loss',
  warning: 'border-warn/30 bg-warn/8 text-warn',
  info: 'border-info/30 bg-info/8 text-info',
};

const severityIcon = {
  critical: OctagonAlert,
  warning: AlertTriangle,
  info: Info,
};

export function AlertCenter({ status, config }: { status: EngineStatus; config?: BotConfig }) {
  const alerts = buildOperationalAlerts(status, config);
  const critical = alerts.filter((alert) => alert.severity === 'critical').length;

  return (
    <Card>
      <CardHeader
        title="Central de alertas"
        description="Halt, feed, API, drawdown e meta em um único lugar."
        eyebrow="Operação"
        icon={<BellRing className="h-4 w-4" />}
        action={
          <Badge variant={critical > 0 ? 'loss' : alerts.length > 0 ? 'warn' : 'profit'} dot>
            {critical > 0
              ? `${critical} crítico(s)`
              : alerts.length > 0
                ? `${alerts.length} aviso(s)`
                : 'nominal'}
          </Badge>
        }
      />
      <CardBody className="pt-3">
        {alerts.length === 0 ? (
          <div
            className="border-profit/25 bg-profit/8 text-profit flex items-center gap-2 rounded-xl border p-3 text-xs"
            role="status"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Nenhum alerta operacional. Feed, API, guard diário e posição estão nominais.
          </div>
        ) : (
          <ul className="space-y-2" aria-live="polite">
            {alerts.map((alert) => {
              const Icon = severityIcon[alert.severity];
              return (
                <li
                  key={alert.id}
                  className={cn('flex gap-3 rounded-xl border p-3', severityStyles[alert.severity])}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-ink text-xs font-semibold">{alert.title}</p>
                    <p className="text-muted mt-0.5 text-[11px] leading-relaxed">{alert.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
