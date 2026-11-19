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
  await page.getByRole('link', { name: 'Пациенты', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Пациенты' })).toBeVisible()
  await page.getByPlaceholder('ФИО или идентификатор пациента').fill('P016')
  await page.getByRole('link', { name: 'Открыть карточку' }).click()
  await expect(page.getByRole('heading', { name: 'Лариса Евгеньевна Попова' })).toBeVisible()
  await expect(page.getByText('Помощник координатора')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Согласование времени' })).toBeVisible()
})
