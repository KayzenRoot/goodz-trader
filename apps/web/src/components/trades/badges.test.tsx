import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PnlText, SideBadge, TradeStatusBadge } from './badges';

describe('trade badges', () => {
  it('renders long and short sides', () => {
    const { rerender } = render(<SideBadge side="long" />);
    expect(screen.getByText('Long')).toBeInTheDocument();
    rerender(<SideBadge side="short" />);
    expect(screen.getByText('Short')).toBeInTheDocument();
  });

  it('renders trade status labels', () => {
    const { rerender } = render(<TradeStatusBadge status="closed" />);
    expect(screen.getByText('Fechada')).toBeInTheDocument();
    rerender(<TradeStatusBadge status="pending" />);
    expect(screen.getByText('Pendente')).toBeInTheDocument();
  });

  it('renders signed pnl', () => {
    render(<PnlText value={12.345} />);
    expect(screen.getByText(/\+12,35 USDT/)).toBeInTheDocument();
  });
});
