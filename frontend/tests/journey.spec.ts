import { expect, test } from '@playwright/test'

test('landing, demo dashboard and call assistant', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Довести маршрут пациента/ })).toBeVisible()
  await page.getByRole('button', { name: /Открыть демо/ }).first().click()
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('heading', { name: 'Рабочий день' })).toBeVisible()
  if ((testInfo.project.use.viewport?.width ?? 1440) < 900) {
    await page.getByRole('button', { name: 'Открыть меню' }).click()
  }
  await page.getByRole('link', { name: 'Все пациенты', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Все пациенты' })).toBeVisible()
  await page.getByPlaceholder('ФИО или код пациента').fill('P001')
  await expect(page.getByText('1 пациентов')).toBeVisible()
  await page.getByRole('link', { name: 'Открыть', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Галина Степановна Жукова' })).toBeVisible()
  await expect(page.getByText('Помощник координатора')).toBeVisible()
  await expect(page.getByText('Неявка', { exact: true }).first()).toBeVisible()
})
