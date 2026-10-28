import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

async function assertNoPageOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, 'page must not scroll horizontally at 390px').toBeLessThanOrEqual(1);
}

test.describe('Goodz Trader mobile', () => {
  test('overview, navigation and trade replay fit 390px', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('overview-page')).toBeVisible();
    await assertNoPageOverflow(page);

    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.getByRole('link', { name: 'Trades', exact: true }).click();
    await expect(page.getByTestId('trades-page')).toBeVisible();
    await assertNoPageOverflow(page);

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(390);
    await expect(dialog.getByText('Replay do trade')).toBeVisible();
    await assertNoPageOverflow(page);
  });

  test('settings form is usable at 390px', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-page')).toBeVisible();
    await assertNoPageOverflow(page);
    await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeVisible();
    await expect(page.getByTestId('save-settings')).toBeVisible();
  });
});
