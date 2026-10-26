import { expect, test } from '@playwright/test';

test.describe('Goodz Trader dashboard', () => {
  test('renderiza visão geral com dados do motor', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('overview-page')).toBeVisible();
    await expect(page.getByText('Equity paper')).toBeVisible();
    await expect(page.getByText('Curva de equity')).toBeVisible();
    await expect(page.getByText('Proteção')).toBeVisible();
    await expect(page.getByText(/demo/i).first()).toBeVisible();
  });

  test('inicia e para o bot em paper mode', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('overview-page')).toBeVisible();

    await page.getByTestId('start-bot').click();
    await expect(page.getByTestId('stop-bot')).toBeVisible({ timeout: 25_000 });
    await expect
      .poll(async () => (await (await page.request.get('/api/status')).json()).status)
      .toBe('running');

    await page.getByTestId('stop-bot').click();
    await page.getByRole('button', { name: 'Parar bot', exact: true }).click();
    await expect(page.getByTestId('start-bot')).toBeVisible({ timeout: 25_000 });
    await expect
      .poll(async () => (await (await page.request.get('/api/status')).json()).status)
      .toBe('stopped');
  });

  test('salva meta diária e persiste após reload', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Conexão MEXC' })).toBeVisible();

    const target = page.getByTestId('daily-profit-target');
    await expect(target).toHaveValue('50');
    await target.fill('77');
    await page.getByTestId('save-settings').click();
    await expect(page.getByText('Configurações salvas')).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByTestId('daily-profit-target')).toHaveValue('77');
  });

  test('mostra ledger, terminal e logs', async ({ page }) => {
    await page.goto('/trades');
    await expect(page.getByTestId('trades-page')).toBeVisible();
    await expect(page.getByText('Ledger de trades')).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible();

    await page.goto('/terminal');
    await expect(page.getByTestId('terminal-page')).toBeVisible();
    await expect(page.getByText('Order book')).toBeVisible();
    await expect(page.locator('canvas').first()).toBeVisible();

    await page.goto('/logs');
    await expect(page.getByTestId('logs-page')).toBeVisible();
    await expect(page.getByText('Tudo que o motor fez, e por quê')).toBeVisible();
  });
});
