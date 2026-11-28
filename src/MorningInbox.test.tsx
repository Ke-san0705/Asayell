// @vitest-environment jsdom
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { LocalStorageRepository } from './repository'
import { matchRoute } from './routes'

const wakeAt = '2026-11-28T07:00:00+09:00'
let container: HTMLDivElement
let root: Root
let repository: LocalStorageRepository

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(wakeAt))
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  repository = new LocalStorageRepository()
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  window.localStorage.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function createGoal() {
  return repository.createGoal({ nickname: 'あさ', title: '朝の散歩', wake_at: wakeAt })
}

async function open(path: string) {
  await act(async () => {
    root.render(<MemoryRouter><App route={matchRoute(path, '/Asayell/')} repository={repository} /></MemoryRouter>)
  })
}

it('waits to fetch messages until the scheduled instant and shows one at a time', async () => {
  vi.setSystemTime(Date.parse(wakeAt) - 1)
  const goal = await createGoal()
  await repository.createMessage({ goal_id: goal.goal_id, sender: 'はる', body: '一通目のエール' })
  await repository.createMessage({ goal_id: goal.goal_id, body: '二通目のエール' })
  const listMessages = vi.spyOn(repository, 'listMessages')

  await open('/Asayell/o/' + goal.owner_token)
  expect(container.textContent).toContain('明日の朝にエールが届きます')
  expect(container.textContent).not.toContain('一通目のエール')
  expect(container.textContent).not.toContain('二通目のエール')
  expect(listMessages).not.toHaveBeenCalled()

  await act(async () => vi.advanceTimersByTimeAsync(1))
  expect(container.textContent).toContain('おはようございます')
  expect(container.textContent).toContain('受信前アンケート')
  expect(container.querySelector('blockquote')).toBeNull()
  await press('回答せずにエールを読む')
  expect(container.textContent).toContain('2件')
  expect(container.textContent).toContain('一通目のエール')
  expect(container.textContent).toContain('はる')
  expect(container.textContent).not.toContain('二通目のエール')

  const next = () => act(async () => {
    const button = container.querySelector('button')
    expect(button?.textContent).toBe('次へ')
    button!.click()
  })
  await next()
  expect(container.textContent).not.toContain('一通目のエール')
  expect(container.textContent).toContain('二通目のエール')

  await next()
  expect(container.textContent).not.toContain('二通目のエール')
  expect(container.textContent).toContain('すべてのエールを読み終えました')
  expect(await repository.getSurveyStatus(goal.owner_token)).toEqual([])
  expect(container.textContent).toContain('受信後アンケート')
  await press('回答せずに終了する')
  expect(container.querySelector('button')).toBeNull()
})

it('shows the fixed encouragement and no message controls when the inbox is empty', async () => {
  const goal = await createGoal()
  await open('/Asayell/o/' + goal.owner_token)
  await press('回答せずにエールを読む')
  expect(container.textContent).toContain('0件')
  expect(container.textContent).toContain('今日も自分のペースで')
  expect(container.querySelector('blockquote, .inbox-action')).toBeNull()
})

it('keeps messages off the support route and rejects support or unknown owner tokens', async () => {
  const goal = await createGoal()
  await repository.createMessage({ goal_id: goal.goal_id, body: '本人だけへのエール' })
  const listMessages = vi.spyOn(repository, 'listMessages')
  const goalLookup = vi.spyOn(repository, 'getGoalByOwnerToken')

  await open('/Asayell/s/' + goal.support_token)
  expect(container.textContent).toContain('エールを送る')
  expect(container.textContent).not.toContain('本人だけへのエール')
  expect(goalLookup).not.toHaveBeenCalled()

  for (const token of [goal.support_token, 'unknown']) {
    await open('/Asayell/o/' + token)
    expect(container.textContent).toContain('受信リンクが見つかりませんでした')
    expect(container.textContent).not.toContain('本人だけへのエール')
  }
  expect(listMessages).not.toHaveBeenCalled()
})

function press(label: string) {
  return act(async () => {
    const button = [...container.querySelectorAll('button')]
      .find((candidate) => candidate.textContent?.trim() === label)
    expect(button).toBeDefined()
    button!.click()
  })
}

it('previews real messages one at a time and closes the preview before wake-up', async () => {
  vi.setSystemTime(Date.parse(wakeAt) - 60_000)
  const goal = await createGoal()
  await repository.createMessage({ goal_id: goal.goal_id, body: '最初のエール' })
  await repository.createMessage({ goal_id: goal.goal_id, body: '次のエール' })
  const listMessages = vi.spyOn(repository, 'listMessages')

  await open('/Asayell/o/' + goal.owner_token)
  expect(listMessages).not.toHaveBeenCalled()

  await press('デモ：翌朝を体験する')
  expect(listMessages).toHaveBeenCalledExactlyOnceWith(goal.goal_id)
  expect(container.textContent).toContain('デモモードで表示しています')
  await press('回答せずにエールを読む')
  expect(container.querySelector('blockquote')?.textContent).toBe('最初のエール')
  expect(container.textContent).not.toContain('次のエール')

  await press('次へ')
  expect(container.querySelector('blockquote')?.textContent).toBe('次のエール')
  await press('デモを終了する')
  expect(container.textContent).toContain('明日の朝にエールが届きます')
  expect(container.textContent).not.toContain('デモモードで表示しています')
  expect(container.querySelector('blockquote')).toBeNull()
  expect(listMessages).toHaveBeenCalledTimes(1)

  await act(async () => vi.advanceTimersByTimeAsync(60_000))
  await press('回答せずにエールを読む')
  expect(container.querySelector('blockquote')?.textContent).toBe('最初のエール')
  expect(listMessages).toHaveBeenCalledTimes(2)
})

it('keeps the demo identified for an empty inbox and lets the owner return', async () => {
  vi.setSystemTime(Date.parse(wakeAt) - 60_000)
  const goal = await createGoal()
  await open('/Asayell/o/' + goal.owner_token)

  await press('デモ：翌朝を体験する')
  expect(container.textContent).toContain('デモモードで表示しています')
  await press('回答せずにエールを読む')
  expect(container.textContent).toContain('0件')
  expect(container.textContent).toContain('今日も自分のペースで')
  expect(container.querySelector('blockquote')).toBeNull()

  await press('デモを終了する')
  expect(container.textContent).toContain('明日の朝にエールが届きます')
})

it('discards a pending demo response after the owner exits', async () => {
  vi.setSystemTime(Date.parse(wakeAt) - 60_000)
  const goal = await createGoal()
  const message = await repository.createMessage({ goal_id: goal.goal_id, body: '遅れて届く本文' })
  let resolvePreview!: (messages: Awaited<ReturnType<typeof repository.listMessages>>) => void
  const pending = new Promise<Awaited<ReturnType<typeof repository.listMessages>>>((resolve) => {
    resolvePreview = resolve
  })
  vi.spyOn(repository, 'listMessages').mockReturnValueOnce(pending)
  await open('/Asayell/o/' + goal.owner_token)

  await press('デモ：翌朝を体験する')
  expect(container.textContent).toContain('デモモードで表示しています')
  await press('デモを終了する')
  await act(async () => resolvePreview([message]))

  expect(container.textContent).not.toContain('遅れて届く本文')
  expect(container.textContent).toContain('明日の朝にエールが届きます')
})


it('saves the owner visibility toggle and hides the current message', async () => {
  const goal = await createGoal()
  const path = '/Asayell/o/' + goal.owner_token
  await repository.createMessage({ goal_id: goal.goal_id, body: '隠すエール' })
  await repository.createMessage({ goal_id: goal.goal_id, body: '残すエール' })
  await open(path)

  const checkbox = container.querySelector<HTMLInputElement>('.inbox-visibility input')
  expect(checkbox?.checked).toBe(false)
  await act(async () => checkbox!.click())
  expect(checkbox?.checked).toBe(true)
  expect((await repository.getGoalByOwnerToken(goal.owner_token))?.isPublic).toBe(true)
  await act(async () => checkbox!.click())
  expect(checkbox?.checked).toBe(false)

  await press('回答せずにエールを読む')
  await press('隠す')
  expect(container.querySelector('blockquote')?.textContent).toBe('残すエール')
  expect(container.textContent).toContain('1件')
  expect(await repository.listOwnerMessages(goal.owner_token)).toMatchObject([{ body: '残すエール' }])
})


it('keeps a demo hide in effect when the inbox loads at wake-up during the request', async () => {
  vi.setSystemTime(Date.parse(wakeAt) - 60_000)
  const goal = await createGoal()
  const message = await repository.createMessage({ goal_id: goal.goal_id, body: '非表示にするエール' })

  const hideMessage = repository.hideMessage.bind(repository)
  let finishHide!: () => void
  const pending = new Promise<void>((resolve) => { finishHide = resolve })
  vi.spyOn(repository, 'hideMessage').mockImplementationOnce(async (...args) => {
    await pending
    await hideMessage(...args)
  })
  await open('/Asayell/o/' + goal.owner_token)
  await press('デモ：翌朝を体験する')
  await press('回答せずにエールを読む')
  await press('隠す')
  await act(async () => vi.advanceTimersByTimeAsync(60_000))
  const exit = [...container.querySelectorAll('button')].find((button) => button.textContent === 'デモを終了する')
  expect(exit?.disabled).toBe(true)
  await act(async () => finishHide())
  await press('デモを終了する')
  await press('回答せずにエールを読む')
  expect(container.textContent).toContain('0件')
  expect(container.textContent).not.toContain(message.body)
})

async function answer(values: number[]) {
  const form = container.querySelector('form')!
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
  expect(form.querySelectorAll('fieldset')).toHaveLength(values.length)
  await act(async () => {
    form.querySelectorAll('fieldset').forEach((group, index) => {
      group.querySelector<HTMLInputElement>('input[value="' + values[index] + '"]')!.click()
    })
  })
  expect(submit.disabled).toBe(true)
  await act(async () => form.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
  expect(submit.disabled).toBe(false)
  await act(async () => submit.click())
}

it.each([false, true])('saves consented pre and post responses and omits answered phases (demo=%s)', async (isDemo) => {
  if (isDemo) vi.setSystemTime(Date.parse(wakeAt) - 60_000)
  const goal = await createGoal()
  const path = '/Asayell/o/' + goal.owner_token
  await repository.createMessage({ goal_id: goal.goal_id, body: '朝のエール' })
  const save = vi.spyOn(repository, 'saveSurveyResponse')

  async function openInbox() {
    await open(path)
    if (isDemo) await press('デモ：翌朝を体験する')
  }

  await openInbox()
  expect(container.querySelector('blockquote')).toBeNull()
  await answer([1, 2, 3])
  expect(save).toHaveBeenNthCalledWith(1, goal.owner_token, {
    phase: 'pre', isDemo, q1: 1, q2: 2, q3: 3, consent: true,
  })
  expect(container.querySelector('blockquote')?.textContent).toBe('朝のエール')
  expect(container.textContent).not.toContain('受信後アンケート')
  await press('次へ')
  await answer([2, 3, 4, 5])
  expect(save).toHaveBeenNthCalledWith(2, goal.owner_token, {
    phase: 'post', isDemo, q1: 2, q2: 3, q3: 4, continueIntent: 5, consent: true,
  })

  await open('/Asayell/')
  if (isDemo) vi.setSystemTime(new Date(wakeAt))
  await open(path)
  expect(container.textContent).not.toContain('受信前アンケート')
  expect(container.querySelector('blockquote')?.textContent).toBe('朝のエール')
  await press('次へ')
  expect(container.textContent).not.toContain('受信後アンケート')
  expect(await repository.getSurveyStatus(goal.owner_token)).toEqual(['pre', 'post'])
  expect(save).toHaveBeenCalledTimes(2)
})

it('lets the owner skip while survey status is pending and keeps the message available on failure', async () => {
  const goal = await createGoal()
  await repository.createMessage({ goal_id: goal.goal_id, body: '朝のエール' })
  let failStatus!: (error: Error) => void
  vi.spyOn(repository, 'getSurveyStatus').mockReturnValueOnce(new Promise((_, reject) => { failStatus = reject }))

  await open('/Asayell/o/' + goal.owner_token)
  expect(container.querySelector('blockquote')).toBeNull()
  await press('回答せずにエールを読む')
  await act(async () => failStatus(new Error('Survey RPC unavailable')))
  expect(container.querySelector('blockquote')?.textContent).toBe('朝のエール')
  await press('次へ')
  expect(container.textContent).not.toContain('受信後アンケート')
})

it('checks survey status after an in-flight demo save when entering the real inbox', async () => {
  vi.setSystemTime(Date.parse(wakeAt) - 60_000)
  const goal = await createGoal()
  await repository.createMessage({ goal_id: goal.goal_id, body: '朝のエール' })

  let finishSave!: () => void
  const pending = new Promise<void>((resolve) => { finishSave = resolve })
  const save = repository.saveSurveyResponse.bind(repository)
  vi.spyOn(repository, 'saveSurveyResponse').mockImplementationOnce(async (...args) => {
    await pending
    await save(...args)
  })

  await open('/Asayell/o/' + goal.owner_token)
  await press('デモ：翌朝を体験する')
  await answer([1, 2, 3])
  await act(async () => vi.advanceTimersByTimeAsync(60_000))
  await press('デモを終了する')
  expect(container.textContent).not.toContain('受信前アンケート')
  expect(container.querySelector('blockquote')).toBeNull()

  await act(async () => finishSave())
  expect(container.textContent).not.toContain('受信前アンケート')
  expect(container.querySelector('blockquote')?.textContent).toBe('朝のエール')
})
