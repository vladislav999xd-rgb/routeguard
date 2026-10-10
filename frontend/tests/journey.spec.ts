import { expect, test } from '@playwright/test'

test('landing, demo dashboard and call assistant', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Следующий шаг всегда под контролем/ })).toBeVisible()
  await page.getByRole('button', { name: /Открыть демо/ }).click()
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('heading', { name: 'Рабочий день' })).toBeVisible()
  if ((testInfo.project.use.viewport?.width ?? 1440) < 900) {
    await page.getByRole('button', { name: 'Открыть меню' }).click()
  }
  await page.getByRole('link', { name: 'Маршруты', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Маршруты пациентов' })).toBeVisible()
  await page.getByPlaceholder('ФИО, код пациента или UID').fill('P016')
  await page.getByLabel('Открыть маршрут Лариса Евгеньевна Попова').click()
  await expect(page.getByRole('complementary', { name: 'Карточка пациента' })).toBeVisible()
  await page.getByRole('tab', { name: /Задачи/ }).click()
  await expect(page.getByText('Задачи по маршруту')).toBeVisible()
  await page.getByRole('tab', { name: 'Маршрут' }).click()
  await page.getByRole('button', { name: /Подобрать время/ }).click()
  await expect(page.getByText('Помощник звонка')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Согласование времени' })).toBeVisible()
})
