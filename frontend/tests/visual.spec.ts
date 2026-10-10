import { expect, test } from '@playwright/test'
import path from 'node:path'

test('graphite and sage workspace has no global horizontal overflow', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Открыть демо/ }).click()
  await expect(page.getByRole('heading', { name: 'Рабочий день' })).toBeVisible()
  await page.getByLabel(/Открыть маршрут/).first().click()
  await expect(page.getByRole('complementary', { name: 'Карточка пациента' })).toBeVisible()

  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(hasOverflow).toBe(false)

  await page.screenshot({
    path: path.resolve('..', 'screenshots', `graphite-sage-${testInfo.project.name}.png`),
    fullPage: false,
  })
})
