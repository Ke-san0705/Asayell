import { expect, test, type Page } from '@playwright/test'

const nickname = 'あさ'
const title = 'Morning'.repeat(14)
const detail = 'Training'.repeat(37)
const message = 'Go'.repeat(75)

async function registerGoal(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-28T20:00:00+09:00'))
  await page.goto('/Asayell/')
  const register = page.getByRole('button', { name: '目標を登録する' })
  await expect(register).toBeDisabled()
  await page.getByLabel('ニックネーム').fill(nickname)
  await page.getByLabel('夢・目標・楽しみ').fill(title)
  await page.getByLabel('詳細').fill(detail)
  await page.getByLabel('起床予定時刻').fill('07:00')
  await register.click()

  await expect(page).toHaveURL(/\/Asayell\/share\/[^/]+$/)
  await expect(page.getByText('目標を登録しました。', { exact: false })).toBeVisible()
  await page.reload()
  const owner = page.getByRole('link', { name: '本人専用の受信URLを開く' })
  await expect(owner).toHaveAttribute('href', /\/Asayell\/o\/[^/]+$/)
  return owner
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const documentWidth = document.documentElement.clientWidth
    return document.documentElement.scrollWidth <= documentWidth
  })).toBe(true)
}

test('T01/T03/T04/T05/T06: register, share, post and receive in one browser', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const owner = await registerGoal(page)
  const ownerUrl = (await owner.getAttribute('href'))!
  await expectNoHorizontalOverflow(page)

  await page.getByRole('button', { name: '応援募集URLをコピー' }).click()
  await expect(page.getByText('応援募集URLをコピーしました。')).toBeVisible()
  const supportUrl = await page.evaluate(() => navigator.clipboard.readText())
  expect(supportUrl).toMatch(/\/Asayell\/s\/[^/]+$/)
  expect(new URL(supportUrl).pathname.split('/').at(-1))
    .not.toBe(new URL(ownerUrl).pathname.split('/').at(-1))

  await page.goto(supportUrl)
  await expect(page.getByText(nickname + 'さんの目標')).toBeVisible()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page.getByText(detail, { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  const body = page.getByLabel('メッセージ本文')
  const submit = page.getByRole('button', { name: 'エールを投稿する' })
  await expect(submit).toBeDisabled()
  await body.fill('　 ')
  await expect(submit).toBeDisabled()
  await body.fill(message + '!')
  await expect(page.getByRole('alert')).toHaveText('エールは150文字まで届けられます。')
  await expect(submit).toBeDisabled()
  await body.fill(message)
  await submit.click()
  await expect(page.getByRole('status')).toContainText('翌朝に届きます')

  await page.reload()
  await expect(body).toBeVisible()
  await expect(page.getByText(message, { exact: true })).toHaveCount(0)
  const supportTokenAsOwner = new URL(supportUrl)
  supportTokenAsOwner.pathname = supportTokenAsOwner.pathname.replace('/s/', '/o/')
  await page.goto(supportTokenAsOwner.href)
  await expect(page.getByText('受信リンクが見つかりませんでした。', { exact: false })).toBeVisible()
  await expect(page.getByText(message, { exact: true })).toHaveCount(0)

  await page.goto(ownerUrl)
  const waiting = page.getByText('明日の朝にエールが届きます。', { exact: false })
  await expect(waiting).toBeVisible()
  await expect(page.getByText(message, { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'デモ：翌朝を体験する' }).click()
  await expect(page.getByText('デモモードで表示しています')).toBeVisible()
  await expect(page.getByText(nickname + 'さん、おはようございます。')).toBeVisible()
  await expect(page.getByText('1件', { exact: true })).toBeVisible()
  await expect(page.getByRole('blockquote')).toHaveText(message)
  await expectNoHorizontalOverflow(page)

  await page.getByRole('button', { name: 'デモを終了する' }).click()
  await expect(waiting).toBeVisible()
  await expect(page.getByRole('blockquote')).toHaveCount(0)

  await page.clock.setFixedTime(new Date('2026-11-29T07:00:00+09:00'))
  await page.reload()
  await expect(page.getByRole('blockquote')).toHaveText(message)
  await expect(page.getByText('デモモードで表示しています')).toHaveCount(0)
})

test('T05: an empty inbox shows the fixed message', async ({ page }) => {
  const owner = await registerGoal(page)
  await owner.click()
  await page.getByRole('button', { name: 'デモ：翌朝を体験する' }).click()
  await expect(page.getByText('0件', { exact: true })).toBeVisible()
  await expect(page.getByText('今日も自分のペースで。', { exact: true })).toBeVisible()
  await expect(page.getByRole('blockquote')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '次へ' })).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
})
