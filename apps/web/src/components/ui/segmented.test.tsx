import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SegmentedControl } from './segmented';

describe('SegmentedControl', () => {
  it('renders options and emits the selected value', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        value="paper"
        onChange={onChange}
        options={[
          { value: 'paper', label: 'Paper' },
          { value: 'live', label: 'Real' },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Paper' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Real' }));
    expect(onChange).toHaveBeenCalledWith('live');
  });
});
