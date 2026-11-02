import { expect, test } from '@playwright/test'

test('P013 missed step can be contacted, rebooked and completed', async ({ page }, testInfo) => {
  test.skip(!['mobile', 'desktop'].includes(testInfo.project.name), 'The critical workflow is covered on mobile and desktop.')

  await page.goto('/')
  await page.getByRole('button', { name: /Открыть демо/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Рабочий день' })).toBeVisible()

  await page.goto('/app/routes')
  await page.getByPlaceholder('ФИО, код пациента или UID').fill('P013')
  await page.getByLabel('Открыть маршрут Галина Степановна Жукова').click()
  const drawer = page.getByRole('complementary', { name: 'Карточка пациента' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('1 из 2 этапов')).toBeVisible()
  await expect(drawer.getByText('Неявка', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Подобрать время/ }).click()

  await expect(page.getByRole('heading', { name: 'Галина Степановна Жукова' })).toBeVisible()
  const assistant = page.locator('.detail-side .sticky')
  await assistant.getByLabel('Результат разговора').selectOption('callback')
  const callback = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const callbackLocal = new Date(callback.getTime() - callback.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  await assistant.getByLabel('Когда перезвонить').fill(callbackLocal)
  await assistant.getByLabel('Комментарий').fill('Согласована повторная связь по сценарию P013')
  await assistant.getByRole('button', { name: 'Сохранить результат' }).click()
  await expect(assistant.getByRole('status')).toHaveText('Результат сохранён')
  await expect(page.getByText('Согласована повторная связь по сценарию P013')).toBeVisible()

  const currentStep = page.locator('.step').filter({ hasText: 'Контрольное исследование' })
  await currentStep.getByRole('button', { name: 'Выбрать слот' }).click()
  await expect(currentStep.getByText('Свободное время')).toBeVisible()
  await currentStep.locator('.slot-picker button').first().click()
  await expect(currentStep.getByRole('status')).toHaveText('Запись подтверждена')
  await currentStep.getByRole('button', { name: 'Отметить выполненным' }).click()
  await expect(page.getByText('Шаг выполнен', { exact: true })).toBeVisible()
  await expect(page.getByText('Все обязательные шаги выполнены, маршрут завершён')).toBeVisible()
})
