import { expect, test } from '@playwright/test';

const pages = [
  { path: '/', testId: 'overview-page' },
  { path: '/trades', testId: 'trades-page' },
  { path: '/settings', testId: 'settings-page' },
];

for (const { path, testId } of pages) {
  test(`accessible names and keyboard focus on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByTestId(testId)).toBeVisible();

    const issues = await page.evaluate(() => {
      const problems: string[] = [];
      const hasName = (element: Element): boolean => {
        const id = element.getAttribute('id');
        return Boolean(
          element.getAttribute('aria-label') ||
          element.getAttribute('aria-labelledby') ||
          element.getAttribute('title') ||
          (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
          (element as HTMLInputElement).labels?.length,
        );
      };

      for (const element of document.querySelectorAll('input, select, textarea')) {
        const input = element as HTMLInputElement;
        if (input.type === 'hidden') continue;
        if (!hasName(element) && !input.closest('label')) {
          problems.push(`campo sem nome: ${input.name || input.id || input.type}`);
        }
      }

      for (const element of document.querySelectorAll('button, a')) {
        const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!text && !hasName(element)) {
          problems.push(
            `controle sem nome: ${element.tagName.toLowerCase()} ${element.className.slice(0, 60)}`,
          );
        }
      }

      if (document.documentElement.lang !== 'pt-BR') problems.push('html lang ausente');
      if (document.querySelectorAll('img:not([alt])').length > 0) {
        problems.push('imagem sem alt');
      }
      return problems.slice(0, 20);
    });

    expect(issues).toEqual([]);
  });
}

test('keyboard focus moves into the page', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('settings-page')).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const active = await page.evaluate(() => ({
    tag: document.activeElement?.tagName ?? 'BODY',
    label: document.activeElement?.getAttribute('aria-label') ?? '',
  }));
  expect(active.tag).not.toBe('BODY');
});
