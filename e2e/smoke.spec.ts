import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'

const PAGES: { id: string; label: RegExp }[] = [
  { id: 'profile', label: /profile/i },
  { id: 'compare', label: /stay vs leave/i },
  { id: 'planner', label: /scenario planner/i },
  { id: 'funds', label: /funds/i },
  { id: 'rand', label: /rand/i },
  { id: 'risks', label: /risks/i },
  { id: 'ask', label: /ask ai/i },
]

async function goTo(page: Page, label: RegExp) {
  const nav = page.getByRole('navigation').first()
  await nav.getByRole('button', { name: label }).first().click()
}

test.beforeAll(() => {
  fs.mkdirSync('e2e/screenshots', { recursive: true })
})

test('every page renders without console errors and shows numbers', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    // Network failures for the optional AI server (/api/health) are expected when it is not running.
    if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(`console: ${m.text()}`)
  })

  await page.goto('/')
  await expect(page.getByText(/SA Pension Planner/i).first()).toBeVisible()

  for (const p of PAGES) {
    await goTo(page, p.label)
    await page.waitForTimeout(400)
    const body = await page.locator('body').innerText()
    expect(body, `${p.id} should not show NaN`).not.toMatch(/\bNaN\b/)
    expect(body, `${p.id} should not show Infinity`).not.toMatch(/Infinity/)
    expect(body, `${p.id} should not show an engine error`).not.toMatch(/not implemented/i)
    await page.screenshot({ path: `e2e/screenshots/${p.id}.png`, fullPage: true })
  }
  expect(errors, errors.join('\n')).toEqual([])
})

test('changing the exit age changes the comparison', async ({ page }) => {
  await page.goto('/')
  await goTo(page, /stay vs leave/i)
  await page.waitForTimeout(300)
  const before = await page.locator('main').innerText()

  await goTo(page, /profile/i)
  const exit = page.getByLabel(/planned exit age/i).first()
  await exit.fill('63')
  await exit.blur()
  await goTo(page, /stay vs leave/i)
  await page.waitForTimeout(300)
  const after = await page.locator('main').innerText()
  expect(after).not.toEqual(before)
})

test('mobile layout has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  for (const p of PAGES) {
    await goTo(page, p.label)
    await page.waitForTimeout(300)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `${p.id} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(2)
  }
  await page.screenshot({ path: 'e2e/screenshots/mobile-compare.png', fullPage: true })
})
