import { expect, test } from '@playwright/test'
import path from 'node:path'

test('capture the real patient-first interface', async ({ page }, testInfo) => {
  test.skip(process.env.ROUTEGUARD_SCREENSHOTS !== '1' || testInfo.project.name !== 'desktop', 'Run explicitly for release screenshots.')
  const shot = (name: string) => path.resolve('..', 'screenshots', `medmarshrut-${name}.png`)

  await page.goto('/')
  await page.getByRole('button', { name: /Открыть демо/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Рабочий день' })).toBeVisible()
  await page.screenshot({ path: shot('overview'), fullPage: false })

  await page.getByRole('link', { name: 'Все пациенты', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Все пациенты' })).toBeVisible()
  await expect(page.locator('.patient-registry-row').first()).toBeVisible()
  await page.screenshot({ path: shot('patients'), fullPage: false })

  await page.getByRole('link', { name: /Зарегистрировать пациента/ }).click()
  await expect(page.getByRole('heading', { name: 'Новый пациент' })).toBeVisible()
  await page.screenshot({ path: shot('registration'), fullPage: false })
  await page.getByLabel('ФИО').fill('Алиса Сергеевна Скриншотова')
  await page.getByLabel('Дата рождения').fill('1992-04-18')
  await page.getByRole('button', { name: 'Зарегистрировать пациента' }).click()
  await page.getByRole('button', { name: 'Создать демо-маршрут' }).click()
  await page.getByRole('button', { name: 'Применить утверждённый план' }).click()
  await expect(page.getByRole('heading', { name: 'Маршрут пациента' })).toBeVisible()
  await page.screenshot({ path: shot('patient-card'), fullPage: false })

  await page.getByText('Документы', { exact: true }).first().click()
  const documents = page.locator('details.collapsible-card[open]').filter({ hasText: 'Документы' }).first()
  await documents.scrollIntoViewIfNeeded()
  await documents.screenshot({ path: shot('route-documents') })
  const assistant = page.locator('.detail-side .sticky')
  await assistant.scrollIntoViewIfNeeded()
  await assistant.screenshot({ path: shot('assistant') })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Алиса Сергеевна Скриншотова' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Маршрут пациента' })).toBeVisible()
  await expect(page.locator('.timeline article').first()).toBeVisible()
  await page.screenshot({ path: shot('mobile'), fullPage: false })
})
