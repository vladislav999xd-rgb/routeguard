import { expect, test } from '@playwright/test'

test('concept landing is clear, responsive and does not load 3D', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One project checks the required breakpoint set.')
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1024, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 780 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /Довести маршрут пациента/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Открыть демо|Продолжить демо/ }).first()).toBeVisible()
    await expect(page.getByText('Найти пациента', { exact: true })).toBeVisible()
    await expect(page.getByText('Зафиксировать результат', { exact: true })).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.locator('.story-canvas')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /анимац/i })).toHaveCount(0)

    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  }

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.getByRole('link', { name: 'Как работает' }).click()
  await expect(page.getByRole('heading', { name: /От поиска пациента/ })).toBeInViewport()
  await expect(page.getByRole('heading', { name: /Организация процесса/ })).toBeVisible()
  expect(pageErrors).toEqual([])
})
