import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { createSupabaseFixture, fixtureKey, fixtureUrl, rpcPath } from './supabaseFixture'

const nickname = 'あさ'
const title = 'Morning'.repeat(14)
const detail = 'Training'.repeat(37)
const message = 'Go'.repeat(75)

function waitForRpc(page: Page, name: string) {
  return page.waitForResponse(response => new URL(response.url()).pathname === rpcPath + name)
}

async function expectRegistrationCategories(page: Page, category?: '夢' | '楽しみ') {
  await expect(page.getByRole('radio', { name: '目標', exact: true })).toBeChecked()
  await expect(page.getByLabel('詳細')).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: 'みんなに公開する' }))
    .toHaveAccessibleDescription(/^起床予定時刻まで、アカウント名・目標タイトル・起床予定が公開されます。/)
  if (category) {
    await page.getByText(category, { exact: true }).click()
    await expect(page.getByRole('radio', { name: category, exact: true })).toBeChecked()
  }
}

async function saveAccountName(page: Page, name: string) {
  await page.goto('/Asayell/me')
  await page.getByLabel('アカウント名').fill(name)
  await page.getByRole('button', { name: 'アカウント名を保存する' }).click()
  await expect(page.getByText('アカウント名を保存しました。')).toBeVisible()
}

async function registerGoal(
  page: Page, pages: boolean, isPublic = false, category?: '夢' | '楽しみ',
  goalTitle = title, registeredAt = '2026-11-28T20:00:00+09:00',
): Promise<Locator> {
  if (!pages) await page.clock.setFixedTime(new Date(registeredAt))
  const wakeTime = pages
    ? new Date(Date.now() + 12 * 60 * 60 * 1000).toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit',
      })
    : '07:00'
  await saveAccountName(page, nickname)
  await page.goto('/Asayell/')
  const register = page.getByRole('button', { name: '目標を登録する' })
  await expect(register).toBeDisabled()
  await page.getByLabel('夢・目標・楽しみ').fill(goalTitle)
  await expectRegistrationCategories(page, category)
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

async function skipPreSurvey(page: Page, timeout = 5_000) {
  const skip = page.locator('form').getByRole('button', { name: '回答せずにエールを読む' })
  const inboxContent = page.getByRole('blockquote').or(page.getByText('今日も自分のペースで。', { exact: true }))
  await expect(skip.or(inboxContent)).toBeVisible({ timeout })
  if (await skip.isVisible()) await skip.click()
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const documentWidth = document.documentElement.clientWidth
    return document.documentElement.scrollWidth <= documentWidth
  })).toBe(true)
}

test('registration shows first-year employee examples without filling the title', async ({ page }) => {
  await page.goto('/Asayell/')

  const titleInput = page.getByRole('textbox', { name: /夢・目標・楽しみ/ })
  await expect(titleInput).toBeVisible()
  await expect(titleInput).toHaveValue('')
  await expect(titleInput).toHaveAttribute('placeholder', '例：先輩に質問できるようになる')
  const examples = page.getByRole('list', { name: '目標の入力例' })
  await expect(examples.getByRole('listitem')).toHaveText([
    '初めての商談、緊張するけど頑張る',
    '朝の満員電車に負けずに出社する',
    '先輩に質問できるようになる',
  ])
  await expect(examples).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('T01–T06: register, share, post and receive', async ({ page, context, browser }, testInfo) => {
  const pages = testInfo.project.name === 'pages'
  const remote = testInfo.project.name !== 'local'
  const fixture = testInfo.project.name === 'supabase' ? createSupabaseFixture() : undefined
  await fixture?.install(context)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const category = pages ? undefined : '楽しみ'
  const owner = await registerGoal(page, pages, false, category)
  const ownerUrl = (await owner.getAttribute('href'))!
  await expectNoHorizontalOverflow(page)

  await page.getByRole('button', { name: '応援募集URLをコピー' }).click()
  await expect(page.getByText('応援募集URLをコピーしました。')).toBeVisible()
  const supportUrl = await page.evaluate(() => navigator.clipboard.readText())
  expect(supportUrl).toMatch(/\/Asayell\/s\/[^/]+$/)
  await expect(page.getByText(supportUrl, { exact: true })).toBeVisible()
  await expect(page.getByText(ownerUrl, { exact: true })).toBeVisible()
  expect(new URL(supportUrl).pathname.split('/').at(-1))
    .not.toBe(new URL(ownerUrl).pathname.split('/').at(-1))

  if (category) {
    await page.goto('/Asayell/me')
    await expect(page.getByRole('article').getByText(category, { exact: true })).toBeVisible()
  }

  const supporter = remote ? await browser.newContext({ viewport: page.viewportSize() }) : context
  try {
    if (remote) await fixture?.install(supporter)
    const supportPage = remote ? await supporter.newPage() : page
    await supportPage.goto(supportUrl)
    await expect(supportPage.getByText(nickname + 'さんの' + (category ?? '目標'))).toBeVisible()
    await expect(supportPage.getByRole('heading', { name: title })).toBeVisible()
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
      expect(await response.json()).toEqual([{
        nickname, title, detail: null, wake_at: expect.any(String), category: category ? 'fun' : 'goal',
      }])
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
  await expect(page.getByText('1件のエールが届いています')).toBeVisible()
  await expect(page.getByText(message, { exact: true })).toHaveCount(0)
  expect(ownerMessageRequests).toEqual([])
  await page.getByRole('button', { name: 'デモ：翌朝を体験する' }).click()
  await expect(page.getByText('デモモードで表示しています')).toBeVisible()
  await expect(page.getByText(nickname + 'さん、おはようございます。')).toBeVisible()
  await expect(page.getByRole('heading', { name: '受信前アンケート' })).toBeVisible()
  await expect(page.getByRole('blockquote')).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
  await skipPreSurvey(page)
  await expect(page.getByText('1件', { exact: true })).toBeVisible()
  await expect(page.getByRole('blockquote')).toHaveText(message)
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: '次へ' }).click()
  await expect(page.getByRole('heading', { name: '受信後アンケート' })).toBeVisible()
  await page.getByRole('button', { name: '回答せずに終了する' }).click()
  await expect(page.getByRole('heading', { name: '受信後アンケート' })).toHaveCount(0)

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
  await skipPreSurvey(page)
  await expect(page.getByRole('blockquote')).toHaveText(message)
  await expect(page.getByText('デモモードで表示しています')).toHaveCount(0)
  if (remote) expect(ownerMessageRequests).toContain(false)
  await expect(visibility).not.toBeChecked()
  await page.getByRole('button', { name: '隠す' }).click()
  await expect(page.getByText('0件', { exact: true })).toBeVisible()
  await page.reload()
  await skipPreSurvey(page)
  await expect(page.getByText('0件', { exact: true })).toBeVisible()
  await expect(page.getByRole('blockquote')).toHaveCount(0)
})

for (const isDemo of [false, true]) {
  test(`R6-05: save and export one response per phase (demo=${isDemo})`, async ({ page, context }, testInfo) => {
    const pages = testInfo.project.name === 'pages'
    test.skip(pages && !isDemo, 'The production clock cannot be advanced by Playwright')
    const fixture = testInfo.project.name === 'supabase' ? createSupabaseFixture() : undefined
    await fixture?.install(context)

    const owner = await registerGoal(page, pages, false, undefined, '先輩に質問できるようになる')
    const goalId = new URL(page.url()).pathname.split('/').at(-1)
    const ownerUrl = new URL((await owner.getAttribute('href'))!, page.url())
    const supportUrl = new URL(await page.getByText(/^https?:\/\/[^/]+\/Asayell\/s\//).innerText())

    const cheer = '統合テスト用の架空のエール'
    await page.goto(supportUrl.href)
    await page.getByLabel('メッセージ本文').fill(cheer)
    await page.getByRole('button', { name: 'エールを投稿する' }).click()
    await expect(page.getByRole('status')).toContainText('翌朝に届きます')

    await page.goto(ownerUrl.href)
    await expect(page.getByText('1件のエールが届いています')).toBeVisible()
    await expect(page.getByText(cheer)).toHaveCount(0)
    const openDemo = () => page.getByRole('button', { name: 'デモ：翌朝を体験する' }).click()
    if (isDemo) {
      await openDemo()
    } else {
      fixture?.unlock()
      await page.clock.setFixedTime(new Date('2026-11-29T07:00:00+09:00'))
      await page.reload()
    }

    const form = page.locator('form')
    const save = form.getByRole('button', { name: '回答を保存する' })
    const consent = form.getByRole('checkbox', { name: '検証への参加と回答の保存に同意する' })
    const answer = async (scores: number[]) => {
      const questions = form.getByRole('group')
      await expect(questions).toHaveCount(scores.length)
      for (const [index, score] of scores.entries()) {
        await questions.nth(index).getByRole('radio', { name: String(score), exact: true }).check()
      }
      await expect(save).toBeDisabled()
      await consent.check()
      await expect(save).toBeEnabled()
      await save.click()
    }

    await expect(form.getByRole('heading', { name: '受信前アンケート' })).toBeVisible()
    await expect(page.getByRole('blockquote')).toHaveCount(0)
    await answer([1, 2, 3])
    await expect(page.getByRole('blockquote')).toHaveText(cheer)
    const next = page.getByRole('button', { name: '次へ' })
    await next.click()
    await expect(form.getByRole('heading', { name: '受信後アンケート' })).toBeVisible()
    await expect(form.getByRole('group', { name: 'これからもアサエールを使いたい。' })).toBeVisible()
    await answer([3, 4, 5, 4])
    await expect(form).toHaveCount(0)

    await page.reload()
    if (isDemo) await openDemo()
    await expect(page.getByRole('blockquote')).toHaveText(cheer)
    await expect(form.getByRole('heading', { name: '受信前アンケート' })).toHaveCount(0)
    await next.click()
    await expect(page.getByText(/すべてのエールを読み終えました/)).toBeVisible()
    await expect(form.getByRole('heading', { name: '受信後アンケート' })).toHaveCount(0)

    await page.goto('/Asayell/export')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'CSVをダウンロード' }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('asayell-survey-responses.csv')
    const csv = await readFile(await file.path(), 'utf8')
    const [header, ...lines] = csv.trimEnd().split(/\r?\n/)
    expect(header).toBe('goal_id,phase,is_demo,q1,q2,q3,continue_intent,created_at')
    const rows = lines.map(line => line.split(','))
    expect(rows.every(row => row.length === 8)).toBe(true)
    if (!pages) expect(rows).toHaveLength(2)
    const goalRows = rows.filter(row => row[0] === goalId)
    expect(goalRows).toHaveLength(2)
    expect(goalRows.map(row => row.slice(1, 7)).sort()).toEqual([
      ['post', String(isDemo), '3', '4', '5', '4'],
      ['pre', String(isDemo), '1', '2', '3', ''],
    ])
    for (const privateValue of [nickname, cheer, ownerUrl.pathname.split('/').at(-1)!, supportUrl.pathname.split('/').at(-1)!]) {
      expect(csv).not.toContain(privateValue)
    }
  })
}

test('T05: an empty inbox shows the fixed message', async ({ page, context }, testInfo) => {
  if (testInfo.project.name === 'supabase') await createSupabaseFixture().install(context)
  const pages = testInfo.project.name === 'pages'
  const owner = await registerGoal(page, pages, !pages)
  await owner.click()
  if (!pages) await expect(page.getByRole('checkbox', { name: 'みんなに公開する' })).toBeChecked()
  await page.getByRole('button', { name: 'デモ：翌朝を体験する' }).click()
  await skipPreSurvey(page)
  await expect(page.getByText('0件', { exact: true })).toBeVisible()
  await expect(page.getByText('今日も自分のペースで。', { exact: true })).toBeVisible()
  await expect(page.getByRole('blockquote')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '次へ' })).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
})

test('public feed links to support and excludes private or expired goals', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name === 'pages', 'The public feed is tested with local storage and the RPC fixture.')
  let now = new Date('2026-11-28T20:00:00+09:00')
  if (testInfo.project.name === 'supabase') await createSupabaseFixture(() => now.getTime()).install(context)
  await page.clock.install({ time: now })

  const owner = await registerGoal(page, false, false, '夢')
  const ownerUrl = (await owner.getAttribute('href'))!
  await page.goto('/Asayell/')
  await page.getByRole('link', { name: 'みんなの夢', exact: true }).click()
  const empty = page.getByText('公開中の夢はまだありません。')
  const support = page.getByRole('link', { name: '応援する' })
  await expect(page).toHaveURL(/\/Asayell\/feed$/)
  await expect(empty).toBeVisible()
  await expect(support).toHaveCount(0)
  await page.getByRole('link', { name: '自分の夢を登録する' }).click()
  await expect(page).toHaveURL(/\/Asayell\/$/)

  await page.goto(ownerUrl)
  const visibility = page.getByRole('checkbox', { name: 'みんなに公開する' })
  await visibility.click()
  await expect(visibility).toBeChecked()
  await expect(visibility).toBeEnabled()
  await page.getByRole('link', { name: 'みんなの夢を見る' }).click()
  await expect(page.getByRole('article').getByText('夢', { exact: true })).toBeVisible()
  await expect(page.getByText(nickname, { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page.getByText('明日 7:00 起床')).toBeVisible()
  await expect(page.getByText('届いた応援 0件')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expect(support).toHaveAttribute('href', /^\/Asayell\/s\//)
  await support.click()
  await page.getByLabel('メッセージ本文').fill(message)
  await page.getByRole('button', { name: 'エールを投稿する' }).click()
  await expect(page.getByRole('status')).toContainText('翌朝に届きます')

  await page.goto('/Asayell/feed')
  await expect(page.getByText('届いた応援 1件')).toBeVisible()
  await expect(page.getByText(message, { exact: true })).toHaveCount(0)
  expect(await page.locator('main').innerHTML()).not.toContain(ownerUrl.split('/').at(-1))

  now = new Date('2026-11-29T00:00:00+09:00')
  await page.clock.setFixedTime(now)
  await page.clock.fastForward('04:00:00')
  await expect(page.getByText('今日 7:00 起床')).toBeVisible()

  now = new Date('2026-11-29T07:00:00+09:00')
  await page.clock.setFixedTime(now)
  await page.clock.fastForward('07:00:00')
  await expect(empty).toBeVisible()
  await page.reload()
  await expect(empty).toBeVisible()
  await expect(support).toHaveCount(0)
})

test('R5-03: the profile merges device goals and legacy receipts with details', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name === 'pages', 'Creating a pre-R5 goal requires a test backend.')
  const remote = testInfo.project.name === 'supabase'
  const now = new Date('2026-11-28T20:00:00+09:00')
  if (remote) await createSupabaseFixture(() => now.getTime()).install(context)
  await page.clock.setFixedTime(now)
  await page.goto('/Asayell/')

  const legacyTitle = '以前に登録した夢'
  const legacy = await page.evaluate(async ({ remote, fixtureUrl, fixtureKey, legacyTitle, detail }) => {
    const path = remote ? '/Asayell/src/supabaseRepository.ts' : '/Asayell/src/repository.ts'
    const { SupabaseRepository, LocalStorageRepository } = await import(path)
    const repository = remote
      ? new SupabaseRepository(fixtureUrl, fixtureKey)
      : new LocalStorageRepository()
    return repository.createGoal({
      nickname: '以前の表示名',
      title: legacyTitle,
      detail,
      wake_at: '2026-11-29T07:00:00+09:00',
      category: 'dream',
      isPublic: true,
    })
  }, { remote, fixtureUrl, fixtureKey, legacyTitle, detail })

  await registerGoal(page, false, true, '夢')
  await page.goto('/Asayell/me')
  const card = (name: string) => page.getByRole('article').filter({
    has: page.getByRole('heading', { name, exact: true }),
  })
  await expect(card(title)).toHaveCount(1)
  await expect(card(legacyTitle)).toHaveCount(1)
  await card(legacyTitle).getByRole('button', { name: '受信画面を開く' }).click()
  await expect(page).toHaveURL('/Asayell/o/' + legacy.owner_token)
  await expect(page.getByText(/明日の朝にエールが届きます/)).toBeVisible()

  await page.goto('/Asayell/feed')
  await expect(card(title).getByText(nickname, { exact: true })).toBeVisible()
  await expect(card(legacyTitle).getByText(detail, { exact: true })).toBeVisible()
  await card(legacyTitle).getByRole('link', { name: '応援する' }).click()
  await expect(page.getByText(detail, { exact: true })).toBeVisible()
})

test('R4-04: public feed stacks compact cards newest first', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'supabase', 'The RPC fixture stores a single goal.')
  const pages = testInfo.project.name === 'pages'
  const suffix = pages ? ' ' + crypto.randomUUID() : ''
  const olderTitle = 'R4-04 最初の投稿' + suffix
  const newerTitle = 'R4-04 新しい投稿' + suffix
  const ownerUrls: string[] = []

  try {
    const older = await registerGoal(page, pages, !pages, '夢', olderTitle)
    if (pages) ownerUrls.push((await older.getAttribute('href'))!)
    const newer = await registerGoal(page, pages, !pages, '楽しみ', newerTitle, '2026-11-28T20:01:00+09:00')
    if (pages) ownerUrls.push((await newer.getAttribute('href'))!)

    for (const url of ownerUrls) {
      await page.goto(url)
      const visibility = page.getByRole('checkbox', { name: 'みんなに公開する' })
      await expect(visibility).not.toBeChecked()
      await visibility.check()
      await expect(visibility).toBeEnabled()
      await expect(visibility).toBeChecked()
    }

    await page.goto('/Asayell/feed')
    const headings = page.getByRole('heading', { name: olderTitle, exact: true })
      .or(page.getByRole('heading', { name: newerTitle, exact: true }))
    const cards = page.getByRole('region', { name: '公開中の夢' }).getByRole('article').filter({ has: headings })
    await expect(cards.getByRole('heading')).toHaveText([newerTitle, olderTitle])
    await expect(cards.first().getByText('楽しみ', { exact: true })).toBeVisible()
    await expect(cards.last().getByText('夢', { exact: true })).toBeVisible()
    if (!pages) await expect(cards.last().getByRole('heading')).toBeInViewport()
    await expectNoHorizontalOverflow(page)
  } finally {
    for (const url of ownerUrls) {
      await page.goto(url)
      const visibility = page.getByRole('checkbox', { name: 'みんなに公開する' })
      await expect(visibility).toBeVisible()
      if (await visibility.isChecked()) {
        await visibility.click()
        await expect(visibility).toBeEnabled()
        await expect(visibility).not.toBeChecked()
      }
    }
  }
})

test('primary navigation and device profile manage a registered goal', async ({ page, context, browser }, testInfo) => {
  test.skip(testInfo.project.name === 'pages', 'The profile is tested with local storage and the RPC fixture.')
  const now = new Date('2026-11-28T20:00:00+09:00')
  const fixture = testInfo.project.name === 'supabase' ? createSupabaseFixture(() => now.getTime()) : undefined
  await fixture?.install(context)
  const owner = await registerGoal(page, false, true)
  const ownerUrl = (await owner.getAttribute('href'))!
  const ownerToken = new URL(ownerUrl).pathname.split('/').at(-1)!
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const shareUrl = page.url()
  const nav = page.getByRole('navigation', { name: 'メインナビゲーション' })
  const post = nav.getByRole('link', { name: '投稿' })
  await expect(post).toHaveAttribute('aria-current', 'page')
  await post.click()
  await expect(page).toHaveURL('/Asayell/')

  await page.goto(shareUrl)
  await nav.getByRole('link', { name: 'プロフィール' }).click()
  await expect(page).toHaveURL('/Asayell/me')

  await page.goto(shareUrl)
  await nav.getByRole('link', { name: 'みんなの夢' }).click()
  await expect(page).toHaveURL('/Asayell/feed')
  const support = page.getByRole('link', { name: '応援する' })
  await expect(support).toBeVisible()
  const supportUrl = (await support.getAttribute('href'))!
  const navBox = (await nav.boundingBox())!
  const supportBox = (await support.boundingBox())!
  expect(supportBox.y + supportBox.height).toBeLessThanOrEqual(navBox.y)
  await support.click()
  await expect(nav).toBeVisible()
  await page.getByLabel('メッセージ本文').fill(message)
  await page.setViewportSize({ width: 320, height: 420 })
  const submit = page.getByRole('button', { name: 'エールを投稿する' })
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const submitBox = (await submit.boundingBox())!
  const supportNavBox = (await nav.boundingBox())!
  expect(submitBox.y).toBeGreaterThanOrEqual(0)
  expect(submitBox.y + submitBox.height).toBeLessThanOrEqual(supportNavBox.y)
  await page.setViewportSize({ width: 320, height: 780 })
  await submit.click()
  await expect(page.getByRole('status')).toContainText('翌朝に届きます')

  const ownerMessages: string[] = []
  page.on('request', request => {
    if (new URL(request.url()).pathname === rpcPath + 'asayell_get_owner_messages') {
      ownerMessages.push(request.url())
    }
  })
  await page.goBack()
  await nav.getByRole('link', { name: 'プロフィール' }).click()
  await expect(page).toHaveURL(/\/Asayell\/me$/)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page.locator('time')).toContainText('7:00')
  await expect(page.getByText('届いた応援 1件')).toBeVisible()
  const absoluteSupportUrl = new URL(supportUrl, page.url()).href
  await expect(page.locator('main')).not.toContainText(absoluteSupportUrl)
  await expect(page.locator('main')).not.toContainText(ownerUrl)
  await page.getByRole('button', { name: '応援募集URLをコピー' }).click()
  await expect(page.getByRole('status')).toHaveText('応援募集URLをコピーしました。')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(absoluteSupportUrl)
  expect(await page.locator('main').innerHTML()).not.toContain(ownerToken)
  await expect(page.getByText(message, { exact: true })).toHaveCount(0)
  expect(ownerMessages).toEqual([])
  await expectNoHorizontalOverflow(page)

  const restoredFeed = await context.newPage()
  await restoredFeed.clock.setFixedTime(now)
  await restoredFeed.goto(new URL('/Asayell/feed', page.url()).href)
  await expect(restoredFeed.getByRole('link', { name: '応援する' })).toBeVisible()

  const toggle = page.getByRole('checkbox', { name: 'みんなの夢に公開' })
  await expect(toggle).toBeChecked()
  await toggle.click()
  await expect(toggle).not.toBeChecked()
  await expect(toggle).toBeEnabled()

  await restoredFeed.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
  await expect(restoredFeed.getByText('公開中の夢はまだありません。')).toBeVisible()
  await restoredFeed.close()

  await nav.getByRole('link', { name: 'みんなの夢' }).click()
  await expect(page.getByText('公開中の夢はまだありません。')).toBeVisible()
  await nav.getByRole('link', { name: '投稿' }).click()
  await expect(page.getByRole('heading', { name: '目標登録' })).toBeVisible()
  await nav.getByRole('link', { name: 'プロフィール' }).click()
  await expect(toggle).not.toBeChecked()
  await page.getByRole('button', { name: '受信画面を開く' }).click()
  await expect(page).toHaveURL(ownerUrl)
  await expect(nav).toBeVisible()

  const visitor = await browser.newContext()
  try {
    await fixture?.install(visitor)
    const visitorPage = await visitor.newPage()
    await visitorPage.goto(new URL('/Asayell/me', page.url()).href)
    await expect(visitorPage.getByText(/本人専用の受信URLから確認できます/)).toBeVisible()
    await expect(visitorPage.getByRole('heading', { name: title })).toHaveCount(0)
  } finally {
    await visitor.close()
  }
})

test('R4-04: categorized registration reaches a separate browser and the owner inbox', async (
  { page, context, browser, baseURL }, testInfo,
) => {
  test.skip(testInfo.project.name === 'local', 'Separate devices require the Supabase repository.')
  const pages = testInfo.project.name === 'pages'
  if (pages) test.setTimeout(300_000)

  const start = pages ? Date.now() : Date.parse('2026-11-28T20:00:00+09:00')
  const wakeAt = Math.floor(start / 60_000) * 60_000 + 3 * 60_000
  const wakeTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit',
  }).format(wakeAt)
  const goalTitle = 'R4-04 統合テスト ' + crypto.randomUUID()
  const body = 'R4-04 統合テスト用のエールです。'
  let now = start
  const fixture = pages ? undefined : createSupabaseFixture(() => now)
  await fixture?.install(context)
  const visitor = await browser.newContext({ baseURL, viewport: page.viewportSize() })
  let ownerUrl: string | undefined
  let posted = false
  let hidden = false
  let withdrawn = false

  try {
    await fixture?.install(visitor)
    const visitorPage = await visitor.newPage()
    if (fixture) {
      await page.clock.setFixedTime(start)
      await visitorPage.clock.setFixedTime(start)
    }

    const nav = page.getByRole('navigation', { name: 'メインナビゲーション' })
    const visitorNav = visitorPage.getByRole('navigation', { name: 'メインナビゲーション' })
    const card = visitorPage.getByRole('article').filter({
      has: visitorPage.getByRole('heading', { name: goalTitle, exact: true }),
    })

    await saveAccountName(page, 'R4-04 動作確認')
    await page.goto('/Asayell/')
    const visibility = page.getByRole('checkbox', { name: 'みんなに公開する' })
    await expect(visibility).not.toBeChecked()
    await page.getByLabel('夢・目標・楽しみ').fill(goalTitle)
    await expectRegistrationCategories(page, '楽しみ')
    await page.getByLabel('起床予定時刻').fill(wakeTime)
    await visibility.check()
    const created = page.waitForRequest(request =>
      new URL(request.url()).pathname === rpcPath + 'asayell_create_goal',
    )
    await page.getByRole('button', { name: '目標を登録する' }).click()
    const { p_support_token: supportToken, p_owner_token: ownerToken, p_is_public: isPublic, p_category: category } =
      (await created).postDataJSON()
    ownerUrl = new URL('/Asayell/o/' + ownerToken, baseURL).href
    expect(isPublic).toBe(true)
    expect(category).toBe('fun')
    await expect(page.getByRole('link', { name: '本人専用の受信URLを開く' })).toHaveAttribute('href', ownerUrl)

    await expect(page).toHaveURL(/\/Asayell\/share\/[^/]+$/)
    await expect(nav.getByRole('link', { name: '投稿' })).toHaveAttribute('aria-current', 'page')
    await expect(nav.getByRole('link', { name: 'みんなの夢' })).toBeVisible()
    await nav.getByRole('link', { name: 'プロフィール' }).click()
    await expect(page).toHaveURL('/Asayell/me')
    const profile = page.getByRole('article').filter({ hasText: goalTitle })
    await expect(profile.getByText('楽しみ', { exact: true })).toBeVisible()
    await expect(profile).not.toContainText(new URL('/Asayell/s/' + supportToken, baseURL).href)
    await expect(profile).not.toContainText(ownerUrl)
    await expect(profile.getByRole('button', { name: '応援募集URLをコピー' })).toBeVisible()

    {
      await expect(profile).toHaveCount(1)
      const storageState = await context.storageState()
      for (const origin of storageState.origins) {
        origin.localStorage = origin.localStorage.filter(({ name }) => name === 'asayell:device-id')
      }
      const sameDevice = await browser.newContext({ baseURL, storageState })
      try {
        await fixture?.install(sameDevice)
        const devicePage = await sameDevice.newPage()
        await devicePage.goto('/Asayell/me')
        const deviceGoal = devicePage.getByRole('article').filter({ hasText: goalTitle })
        await expect(deviceGoal.getByRole('button', { name: '受信画面を開く' })).toBeVisible()
      } finally {
        await sameDevice.close()
      }
    }

    await visitorPage.goto('/Asayell/me')
    await expect(visitorPage.getByLabel('アカウント名')).toBeEmpty()
    await expect(visitorPage.getByText(/このブラウザには登録した夢の控えがありません/)).toBeVisible()

    async function checkFeed(count: number | null) {
      const feed = waitForRpc(visitorPage, 'asayell_list_public_goals')
      await visitorNav.getByRole('link', { name: 'みんなの夢' }).click()
      const response = await feed
      expect(response.ok()).toBe(true)
      const goals = (await response.json()) as Record<string, unknown>[]
      for (const goal of goals) {
        expect(Object.keys(goal).sort()).toEqual([
          'category', 'detail', 'message_count', 'nickname', 'support_token', 'title', 'wake_at',
        ])
      }
      expect(JSON.stringify(goals)).not.toContain(ownerToken)
      expect(JSON.stringify(goals)).not.toContain(body)
      const ours = goals.find(goal => goal.support_token === supportToken)
      if (count === null) {
        expect(ours).toBeUndefined()
        await expect(card).toHaveCount(0)
      } else {
        expect(ours).toMatchObject({ title: goalTitle, nickname: 'R4-04 動作確認', category: 'fun', message_count: count })
        await expect(card.getByText('R4-04 動作確認', { exact: true })).toBeVisible()
        await expect(card.getByText('楽しみ', { exact: true })).toBeVisible()
        await expect(card.getByText('届いた応援 ' + count + '件')).toBeVisible()
      }
    }

    await checkFeed(0)
    const supporterGoal = waitForRpc(visitorPage, 'asayell_get_goal_for_support')
    await card.getByRole('link', { name: '応援する' }).click()
    const supportResponse = await supporterGoal
    expect(supportResponse.ok()).toBe(true)
    expect(await supportResponse.json()).toEqual([{
      nickname: 'R4-04 動作確認', title: goalTitle, detail: null, wake_at: expect.any(String), category: 'fun',
    }])
    await expect(visitorNav).toBeVisible()
    await visitorPage.getByLabel('メッセージ本文').fill(body)
    const postedMessage = waitForRpc(visitorPage, 'asayell_post_message')
    await visitorPage.getByRole('button', { name: 'エールを投稿する' }).click()
    const postResponse = await postedMessage
    posted = postResponse.ok() && await postResponse.json() === true
    expect(posted).toBe(true)
    await expect(visitorPage.getByRole('status')).toContainText('翌朝に届きます')
    await visitorPage.reload()
    await expect(visitorPage.getByLabel('メッセージ本文')).toBeEmpty()
    await expect(visitorPage.getByRole('blockquote')).toHaveCount(0)

    await page.goto('/Asayell/')
    await nav.getByRole('link', { name: 'みんなの夢' }).click()
    await expect(page.getByRole('heading', { name: 'みんなの夢', exact: true })).toBeVisible()
    await nav.getByRole('link', { name: 'プロフィール' }).click()
    await expect(profile.getByText('届いた応援 1件')).toBeVisible()
    await expect(profile.locator('time')).toBeVisible()
    const toggle = profile.getByRole('checkbox', { name: 'みんなの夢に公開' })
    await expect(toggle).toBeChecked()
    const ownerGoal = waitForRpc(page, 'asayell_get_owner_goal')
    await profile.getByRole('button', { name: '受信画面を開く' }).click()
    const ownerResponse = await ownerGoal
    expect(ownerResponse.ok()).toBe(true)
    expect(await ownerResponse.json(), 'asayell_get_owner_goal must return is_public').toMatchObject([
      { title: goalTitle, is_public: true, is_unlocked: false, message_count: 1 },
    ])
    await expect(page).toHaveURL(ownerUrl)
    await expect(page.getByText(/明日の朝にエールが届きます/)).toBeVisible()
    await expect(page.getByText(body, { exact: true })).toHaveCount(0)

    await visitorPage.goto('/Asayell/')
    await checkFeed(1)
    const withdraw = waitForRpc(page, 'asayell_set_public')
    await visibility.click()
    await expect(visibility).not.toBeChecked()
    expect(await (await withdraw).json()).toBe(true)
    withdrawn = true
    await visitorNav.getByRole('link', { name: '投稿' }).click()
    await checkFeed(null)

    if (fixture) {
      now = wakeAt
      fixture.unlock()
      await page.clock.setFixedTime(now)
      await visitorPage.clock.setFixedTime(now)
    }
    await page.reload()
    await skipPreSurvey(page, pages ? 195_000 : 5_000)
    await expect(page.getByRole('blockquote')).toHaveText(body, { timeout: pages ? 195_000 : 5_000 })
    await expect(page.getByText('デモモードで表示しています')).toHaveCount(0)
    await page.getByRole('button', { name: '隠す' }).click()
    await expect(page.getByText('0件', { exact: true })).toBeVisible()
    hidden = true
    await page.reload()
    await skipPreSurvey(page)
    await expect(page.getByText('0件', { exact: true })).toBeVisible()
    await expect(page.getByRole('blockquote')).toHaveCount(0)

    // The RPC must exclude an expired goal even when its public flag is ON.
    const republish = waitForRpc(page, 'asayell_set_public')
    withdrawn = false
    await visibility.click()
    await expect(visibility).toBeChecked()
    expect(await (await republish).json()).toBe(true)
    await visitorNav.getByRole('link', { name: '投稿' }).click()
    await checkFeed(null)

    await page.getByRole('link', { name: 'みんなの夢を見る' }).click()
    await nav.getByRole('link', { name: '投稿' }).click()
    await expect(page.getByRole('heading', { name: '目標登録' })).toBeVisible()
  } finally {
    await visitor.close()
    if (ownerUrl && (!withdrawn || posted && !hidden)) {
      await page.goto(ownerUrl)
      if (!withdrawn) {
        const toggle = page.getByRole('checkbox', { name: 'みんなに公開する' })
        await expect(toggle).toBeVisible()
        if (await toggle.isChecked()) {
          const cleanup = waitForRpc(page, 'asayell_set_public')
          await toggle.click()
          await expect(toggle).not.toBeChecked()
          expect(await (await cleanup).json()).toBe(true)
        }
      }
      if (posted && !hidden) {
        const demo = page.getByRole('button', { name: 'デモ：翌朝を体験する' })
        const skip = page.getByRole('button', { name: '回答せずにエールを読む' })
        await expect(page.getByRole('blockquote').or(demo).or(skip)).toBeVisible()
        if (await demo.isVisible()) await demo.click()
        await skipPreSurvey(page)
        await page.getByRole('button', { name: '隠す' }).click()
        await expect(page.getByText('0件', { exact: true })).toBeVisible()
      }
    }
  }
})


test('R5-01: registration requires an account name and changes persist after reload', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name === 'pages', 'The account setup is verified with local storage and the RPC fixture.')
  if (testInfo.project.name === 'supabase') await createSupabaseFixture().install(context)

  await page.goto('/Asayell/')
  await page.getByLabel('夢・目標・楽しみ').fill('朝の散歩')
  await page.getByLabel('起床予定時刻').fill('07:00')
  await expect(page.getByRole('button', { name: '目標を登録する' })).toBeDisabled()
  await expect(page.getByLabel('ニックネーム')).toHaveCount(0)
  await page.locator('form').getByRole('link', { name: 'プロフィール' }).click()

  const input = page.getByLabel('アカウント名')
  const save = page.getByRole('button', { name: 'アカウント名を保存する' })
  await input.fill('あ'.repeat(21))
  await save.click()
  await expect(page.getByRole('alert')).toHaveText('アカウント名は1〜20文字で入力してください。')

  await input.fill('🌅'.repeat(20))
  await save.click()
  await expect(page.getByText('アカウント名を保存しました。')).toBeVisible()
  await page.goBack()
  await expect(page.getByText('アカウント名 ' + '🌅'.repeat(20))).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.getByRole('link', { name: 'プロフィール' }).click()
  await page.reload()
  await expect(input).toHaveValue('🌅'.repeat(20))
  await input.fill('朝さん')
  await save.click()
  await expect(page.getByText('アカウント名を保存しました。')).toBeVisible()
  await page.reload()
  await expect(input).toHaveValue('朝さん')
  await page.getByRole('link', { name: '投稿' }).click()
  await expect(page.getByText('アカウント名 朝さん')).toBeVisible()
})

test('profile confirms navigation with an unsaved account name', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name === 'pages', 'Uses local storage or the RPC fixture.')
  if (testInfo.project.name === 'supabase') await createSupabaseFixture().install(context)

  await page.goto('/Asayell/')
  const nav = page.getByRole('navigation', { name: 'メインナビゲーション' })
  await nav.getByRole('link', { name: 'プロフィール' }).click()
  const input = page.getByLabel('アカウント名')
  const dialog = page.getByRole('dialog', { name: 'アカウント名を保存しますか？' })
  await input.fill('朝さん')
  await nav.getByRole('link', { name: 'みんなの夢' }).click()
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/\/me$/)
  await dialog.getByRole('button', { name: 'キャンセル' }).click()
  await expect(dialog).toBeHidden()
  await expect(input).toHaveValue('朝さん')

  await page.goBack()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '保存して移動' }).click()
  await expect(page).toHaveURL(/\/Asayell\/$/)
  await nav.getByRole('link', { name: 'プロフィール' }).click()
  await page.reload()
  await expect(input).toHaveValue('朝さん')

  await input.fill('あ'.repeat(21))
  await page.getByRole('link', { name: 'アサエール' }).click()
  await dialog.getByRole('button', { name: '保存して移動' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('アカウント名は1〜20文字で入力してください。')
  await expect(page).toHaveURL(/\/me$/)

  if (testInfo.project.name === 'supabase') {
    await dialog.getByRole('button', { name: 'キャンセル' }).click()
    await expect(dialog).toBeHidden()
    await input.fill('一時的な名前')
    await page.route(fixtureUrl + rpcPath + 'asayell_upsert_profile', route =>
      route.fulfill({ status: 500, json: { message: 'Save failed' } }), { times: 1 })
    await page.getByRole('link', { name: 'アサエール' }).click()
    await dialog.getByRole('button', { name: '保存して移動' }).click()
    await expect(dialog.getByRole('alert')).toHaveText('アカウント名を保存できませんでした。もう一度お試しください。')
    await expect(page).toHaveURL(/\/me$/)
  }
  await dialog.getByRole('button', { name: '保存せず移動' }).click()
  await expect(page).toHaveURL(/\/Asayell\/$/)
  await nav.getByRole('link', { name: 'プロフィール' }).click()
  await expect(input).toHaveValue('朝さん')

  await input.fill('新しい名前')
  await page.getByRole('button', { name: 'アカウント名を保存する' }).click()
  await expect(page.getByText('アカウント名を保存しました。')).toBeVisible()
  await nav.getByRole('link', { name: 'みんなの夢' }).click()
  await expect(page).toHaveURL(/\/feed$/)
})
