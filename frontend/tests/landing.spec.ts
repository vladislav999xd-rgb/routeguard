import { expect, test } from '@playwright/test'
import path from 'node:path'

test('3D landing keeps its content and CTA usable at key breakpoints', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One project captures the required breakpoint set.')

  const cases = [
    { name: 'desktop', width: 1440, height: 1000, webgl: true },
    { name: 'tablet', width: 1024, height: 900, webgl: true },
    { name: 'mobile', width: 390, height: 844, webgl: false },
  ]

  for (const viewport of cases) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Каждый следующий шаг пациента/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Открыть демо/ }).first()).toBeVisible()

    if (viewport.webgl) {
      await expect(page.locator('.story-canvas canvas')).toBeVisible()
      await page.waitForTimeout(500)
    }
    else await expect(page.locator('.story-canvas')).toHaveCount(0)

    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(hasOverflow).toBe(false)
    await page.screenshot({
      path: path.resolve('..', 'screenshots', `landing-3d-${viewport.name}.png`),
      fullPage: false,
    })
  }

  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 780 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Каждый следующий шаг пациента/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  }

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  for (const heading of [
    /Маршрут распадается/,
    /От диагностики до контроля/,
    /День координатора/,
    /К разговору не нужно/,
    /Сигналы внимания/,
    /Пройдите маршрут/,
  ]) {
    await page.getByRole('heading', { name: heading }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect(page.getByRole('heading', { name: /Каждый следующий шаг пациента/ })).toBeVisible()
})

test('reduced motion keeps the landing readable without WebGL', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Reduced-motion fallback only needs one desktop run.')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.story-canvas')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Открыть демо/ }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: /Каждый следующий шаг пациента/ })).toBeVisible()
})
