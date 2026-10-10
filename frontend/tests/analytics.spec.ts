import { expect, test } from '@playwright/test'

test('lazy analytics bundle opens after the demo workspace is created', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One desktop run verifies the lazy application route.')
  await page.goto('/')
  await page.getByRole('button', { name: /Открыть демо/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Рабочий день' })).toBeVisible()
  await page.getByRole('link', { name: 'Аналитика', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Аналитика' })).toBeVisible()
  await expect(page.getByText('Состояние маршрутов')).toBeVisible()
  await expect(page.locator('.recharts-responsive-container').first()).toBeVisible()
})
