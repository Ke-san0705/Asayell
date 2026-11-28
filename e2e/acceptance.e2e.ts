import { expect, test, type Locator, type Page } from '@playwright/test'
import { createSupabaseFixture, rpcPath } from './supabaseFixture'

const nickname = 'あさ'
const title = 'Morning'.repeat(14)
const detail = 'Training'.repeat(37)
const message = 'Go'.repeat(75)

function waitForRpc(page: Page, name: string) {
  return page.waitForResponse(response => new URL(response.url()).pathname === rpcPath + name)
}

async function registerGoal(page: Page, pages: boolean, isPublic = false): Promise<Locator> {
  if (!pages) await page.clock.setFixedTime(new Date('2026-11-28T20:00:00+09:00'))
  const wakeTime = pages
    ? new Date(Date.now() + 12 * 60 * 60 * 1000).toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit',
      })
    : '07:00'
  await page.goto('/Asayell/')
  const register = page.getByRole('button', { name: '目標を登録する' })
  await expect(register).toBeDisabled()
  await page.getByLabel('ニックネーム').fill(nickname)
  await page.getByLabel('夢・目標・楽しみ').fill(title)
  await page.getByLabel('詳細').fill(detail)
  await page.getByLabel('起床予定時刻').fill(wakeTime)
  if (!pages) {
    const visibility = page.getByRole('checkbox', { name: 'みんなに公開する' })
    await expect(visibility).not.toBeChecked()
    if (isPublic) await visibility.check()
  }
  const created = pages ? waitForRpc(page, 'asayell_create_goal') : undefined
  await register.click()
  if (created) {
    const response = await created
    expect(response.ok()).toBe(true)
    const result = await response.json()
    const { id } = Array.isArray(result) ? result[0] : result
    expect(id).toMatch(/^[0-9a-f-]{36}$/i)
    console.log('Supabase acceptance goal id:', id)
  }

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

test('T01–T06: register, share, post and receive', async ({ page, context, browser }, testInfo) => {
  const pages = testInfo.project.name === 'pages'
  const remote = testInfo.project.name !== 'local'
  const fixture = testInfo.project.name === 'supabase' ? createSupabaseFixture() : undefined
  await fixture?.install(context)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const owner = await registerGoal(page, pages)
  const ownerUrl = (await owner.getAttribute('href'))!
  await expectNoHorizontalOverflow(page)

  await page.getByRole('button', { name: '応援募集URLをコピー' }).click()
  await expect(page.getByText('応援募集URLをコピーしました。')).toBeVisible()
  const supportUrl = await page.evaluate(() => navigator.clipboard.readText())
  expect(supportUrl).toMatch(/\/Asayell\/s\/[^/]+$/)
  expect(new URL(supportUrl).pathname.split('/').at(-1))
    .not.toBe(new URL(ownerUrl).pathname.split('/').at(-1))

  const supporter = remote ? await browser.newContext({ viewport: page.viewportSize() }) : context
  try {
    if (remote) await fixture?.install(supporter)
    const supportPage = remote ? await supporter.newPage() : page
    await supportPage.goto(supportUrl)
    await expect(supportPage.getByText(nickname + 'さんの目標')).toBeVisible()
    await expect(supportPage.getByRole('heading', { name: title })).toBeVisible()
    await expect(supportPage.getByText(detail, { exact: true })).toBeVisible()
    await expectNoHorizontalOverflow(supportPage)

    const body = supportPage.getByLabel('メッセージ本文')
    const submit = supportPage.getByRole('button', { name: 'エールを投稿する' })
    await expect(submit).toBeDisabled()
    await body.fill('　 ')
    await expect(submit).toBeDisabled()
    await body.fill(message + '!')
    await expect(supportPage.getByRole('alert')).toHaveText('エールは150文字まで届けられます。')
    await expect(submit).toBeDisabled()
    await body.fill(message)
    await submit.click()
    await expect(supportPage.getByRole('status')).toContainText('翌朝に届きます')

    const publicGoal = remote ? waitForRpc(supportPage, 'asayell_get_goal_for_support') : undefined
    await supportPage.reload()
    if (publicGoal) {
      const response = await publicGoal
      expect(response.ok()).toBe(true)
      expect(await response.json()).toEqual([{ nickname, title, detail, wake_at: expect.any(String) }])
    }
    await expect(body).toBeVisible()
    await expect(supportPage.getByText(message, { exact: true })).toHaveCount(0)

    if (!pages) {
      const supportTokenAsOwner = new URL(supportUrl)
      supportTokenAsOwner.pathname = supportTokenAsOwner.pathname.replace('/s/', '/o/')
      await supportPage.goto(supportTokenAsOwner.href)
      await expect(supportPage.getByText('受信リンクが見つかりませんでした。', { exact: false })).toBeVisible()
      await expect(supportPage.getByRole('blockquote')).toHaveCount(0)
    }
  } finally {
    if (remote) await supporter.close()
  }

  const ownerMessageRequests: unknown[] = []
  page.on('request', request => {
    if (new URL(request.url()).pathname === rpcPath + 'asayell_get_owner_messages') {
      ownerMessageRequests.push(request.postDataJSON().p_demo)
    }
  })
  await page.goto(ownerUrl)
  const waiting = page.getByText('明日の朝にエールが届きます。', { exact: false })
  await expect(waiting).toBeVisible()
  await expect(page.getByText(message, { exact: true })).toHaveCount(0)
  expect(ownerMessageRequests).toEqual([])
  await page.getByRole('button', { name: 'デモ：翌朝を体験する' }).click()
  await expect(page.getByText('デモモードで表示しています')).toBeVisible()
  await expect(page.getByText(nickname + 'さん、おはようございます。')).toBeVisible()
  await expect(page.getByText('1件', { exact: true })).toBeVisible()
  await expect(page.getByRole('blockquote')).toHaveText(message)
  await expectNoHorizontalOverflow(page)

  await page.getByRole('button', { name: 'デモを終了する' }).click()
  await expect(waiting).toBeVisible()
  await expect(page.getByRole('blockquote')).toHaveCount(0)
  if (remote) {
    expect(ownerMessageRequests.length).toBeGreaterThan(0)
    expect(ownerMessageRequests.every(demo => demo === true)).toBe(true)
  }

  if (pages) return
  const visibility = page.getByRole('checkbox', { name: 'みんなに公開する' })
  await expect(visibility).not.toBeChecked()
  await visibility.click()
  await expect(visibility).toBeChecked()
  await page.reload()
  await expect(visibility).toBeChecked()
  await visibility.click()
  await expect(visibility).not.toBeChecked()

  fixture?.unlock()
  await page.clock.setFixedTime(new Date('2026-11-29T07:00:00+09:00'))
  await page.reload()
  await expect(page.getByRole('blockquote')).toHaveText(message)
  await expect(page.getByText('デモモードで表示しています')).toHaveCount(0)
  if (remote) expect(ownerMessageRequests).toContain(false)
  await expect(visibility).not.toBeChecked()
  await page.getByRole('button', { name: '隠す' }).click()
  await expect(page.getByText('0件', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('0件', { exact: true })).toBeVisible()
  await expect(page.getByRole('blockquote')).toHaveCount(0)
})

test('T05: an empty inbox shows the fixed message', async ({ page, context }, testInfo) => {
  if (testInfo.project.name === 'supabase') await createSupabaseFixture().install(context)
  const pages = testInfo.project.name === 'pages'
  const owner = await registerGoal(page, pages, !pages)
  await owner.click()
  if (!pages) await expect(page.getByRole('checkbox', { name: 'みんなに公開する' })).toBeChecked()
  await page.getByRole('button', { name: 'デモ：翌朝を体験する' }).click()
  await expect(page.getByText('0件', { exact: true })).toBeVisible()
  await expect(page.getByText('今日も自分のペースで。', { exact: true })).toBeVisible()
  await expect(page.getByRole('blockquote')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '次へ' })).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
})
