import { expect, test } from '@playwright/test'
import path from 'node:path'

test('graphite and sage workspace has no global horizontal overflow', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Открыть демо/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Рабочий день' })).toBeVisible()
  const menuButton = page.getByRole('button', { name: 'Открыть меню' })
  if (await menuButton.isVisible()) await menuButton.click()
  await page.getByRole('link', { name: 'Все пациенты', exact: true }).click()
  await page.getByPlaceholder('ФИО или код пациента').fill('P001')
  await page.getByRole('link', { name: 'Открыть', exact: true }).first().click()
  await expect(page.locator('.patient-page-head')).toBeVisible()

  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(hasOverflow).toBe(false)

  await page.screenshot({
    path: testInfo.outputPath(`medmarshrut-${testInfo.project.name}.png`),
    fullPage: false,
  })
})
