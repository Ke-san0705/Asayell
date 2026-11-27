// @vitest-environment jsdom
import { act } from 'react'
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
    root.render(<App route={matchRoute(path, '/Asayell/')} repository={repository} />)
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
  expect(container.querySelector('button')).toBeNull()
})

it('shows the fixed encouragement and no message controls when the inbox is empty', async () => {
  const goal = await createGoal()
  await open('/Asayell/o/' + goal.owner_token)
  expect(container.textContent).toContain('0件')
  expect(container.textContent).toContain('今日も自分のペースで')
  expect(container.querySelector('blockquote, button')).toBeNull()
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
