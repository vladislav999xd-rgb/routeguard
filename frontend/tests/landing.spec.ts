import { expect, test } from '@playwright/test'
import path from 'node:path'

test('3D landing keeps its content and CTA usable at key breakpoints', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  test.skip(testInfo.project.name !== 'desktop', 'One project captures the required breakpoint set.')
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

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
  for (const [scene, heading, screenshot] of [
    [2, /Маршрут распадается/, 'problem'],
    [3, /От диагностики до контроля/, 'route'],
    [4, /День координатора/, 'workspace'],
    [5, /К разговору не нужно/, 'call'],
    [6, /Сигналы внимания/, 'analytics'],
    [7, /Пройдите маршрут/, 'final'],
  ] as const) {
    await page.evaluate((targetScene) => {
      const track = document.querySelector<HTMLElement>('.story-track')
      if (!track) return
      const range = track.offsetHeight - window.innerHeight
      window.scrollTo({ top: track.offsetTop + range * ((targetScene - 1) / 6), behavior: 'instant' })
    }, scene)
    await page.waitForTimeout(900)
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    if (['route', 'workspace', 'call', 'final'].includes(screenshot)) {
      await page.screenshot({ path: path.resolve('..', 'screenshots', `landing-3d-${screenshot}.png`), fullPage: false })
    }
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect(page.getByRole('heading', { name: /Каждый следующий шаг пациента/ })).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('motion can be paused explicitly even when the operating system requests reduced motion', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The desktop motion control only needs one run.')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.story-canvas canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Пауза анимации' }).click()
  await expect(page.locator('.story-canvas')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Включить анимацию' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Открыть демо/ }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: /Каждый следующий шаг пациента/ })).toBeVisible()
})

test('cinematic DOM transitions remain available when WebGL is unavailable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The desktop fallback only needs one run.')
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
      return original.call(this, type as '2d', ...args as [])
    } as typeof HTMLCanvasElement.prototype.getContext
  })
  await page.goto('/')
  await expect(page.locator('.story')).toHaveClass(/has-cinematic/)
  await expect(page.locator('.story-canvas')).toHaveCount(0)
  await page.evaluate(() => {
    const track = document.querySelector<HTMLElement>('.story-track')
    if (!track) return
    scrollTo(0, track.offsetTop + (track.offsetHeight - innerHeight) * 0.5)
  })
  await page.waitForTimeout(1000)
  await expect(page.getByRole('heading', { name: /День координатора/ })).toBeVisible()
})
