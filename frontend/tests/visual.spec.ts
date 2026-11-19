import { expect, test } from '@playwright/test'
import path from 'node:path'

test('graphite and sage workspace has no global horizontal overflow', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Открыть демо/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Рабочий день' })).toBeVisible()
  const menuButton = page.getByRole('button', { name: 'Открыть меню' })
  if (await menuButton.isVisible()) await menuButton.click()
  await page.getByRole('link', { name: 'Пациенты', exact: true }).click()
  await page.getByPlaceholder('Введите ФИО или код, например P001').fill('P001')
  await page.getByRole('link', { name: 'Открыть карточку' }).first().click()
  await expect(page.locator('.patient-page-head')).toBeVisible()

  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(hasOverflow).toBe(false)

  await page.screenshot({
    path: path.resolve('..', 'screenshots', `graphite-sage-${testInfo.project.name}.png`),
    fullPage: false,
  })
})
