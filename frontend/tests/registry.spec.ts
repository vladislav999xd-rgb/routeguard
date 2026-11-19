import { expect, test } from '@playwright/test'

test('home search and patient registry preserve a coordinator work context', async ({ page }, testInfo) => {
  test.skip(!['mobile', 'desktop'].includes(testInfo.project.name), 'Core registry behaviour is checked on mobile and desktop.')
  await page.goto('/')
  await page.getByRole('button', { name: /Открыть демо/ }).first().click()

  const findButton = page.getByRole('button', { name: 'Найти пациента' })
  await findButton.click()
  const homeSearch = page.getByPlaceholder('Введите ФИО или код пациента')
  await expect(homeSearch).toBeFocused()
  await homeSearch.fill('P001')
  await expect(page.locator('.home-search-results').getByText('Галина Степановна Жукова')).toBeVisible()

  await page.locator('.home-priority-card.high').click()
  await expect(page).toHaveURL(/\/app\/patients\?.*priority=high.*sort=priority|\/app\/patients\?.*sort=priority.*priority=high/)
  await expect(page.getByRole('heading', { name: 'Все пациенты' })).toBeVisible()
  await expect(page.getByLabel('Приоритет пациентов')).toHaveValue('high')
  await expect(page.locator('.patient-registry-row').first()).toBeVisible()
  await expect(page.locator('.patient-priority.high')).toHaveCount(await page.locator('.patient-registry-row').count())

  await page.getByLabel('Сортировка пациентов').selectOption('deadline')
  await expect(page).toHaveURL(/sort=deadline/)
  const returnUrl = page.url()
  await page.getByRole('link', { name: 'Открыть', exact: true }).first().click()
  await page.getByRole('link', { name: 'Вернуться ко всем пациентам' }).click()
  expect(page.url()).toBe(returnUrl)
})
