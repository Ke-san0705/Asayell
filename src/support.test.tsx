// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { LocalStorageRepository } from './repository'

const repository = new LocalStorageRepository()
const container = document.createElement('div')
const goalInput = {
  nickname: 'あさ',
  title: '朝の散歩',
  detail: '公園まで歩く',
  wake_at: '2026-11-29T07:00:00+09:00',
}
let root: ReturnType<typeof createRoot>

async function openSupportPage(supportToken: string) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<App route={{ name: 'support', supportToken }} repository={repository} />)
  })
}

function enterMessage(body: string) {
  const textarea = container.querySelector('textarea')!
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setValue.call(textarea, body)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('shows the target goal and saves a valid anonymous post without reading other messages', async () => {
  const goal = await repository.createGoal(goalInput)
  const other = await repository.createGoal({ ...goalInput, nickname: '別の人' })
  await repository.createMessage({ goal_id: goal.goal_id, body: 'ほかの人からのエール' })
  const listMessages = vi.spyOn(repository, 'listMessages')
  await openSupportPage(goal.support_token)

  for (const text of [goal.nickname, goal.title, goal.detail]) {
    expect(container.textContent).toContain(text)
  }
  expect(container.textContent).not.toContain('ほかの人からのエール')
  expect(container.querySelector<HTMLInputElement>('#support-sender')?.value).toBe('')

  const button = container.querySelector('button')!
  expect(button.disabled).toBe(true)
  enterMessage('　 ')
  expect(button.disabled).toBe(true)
  enterMessage('朝'.repeat(151))
  expect(button.disabled).toBe(true)
  const body = '朝'.repeat(150)
  enterMessage(body)
  expect(button.disabled).toBe(false)

  await act(async () => button.click())
  expect(container.textContent).toContain('翌朝に届きます')
  expect(container.querySelector('form')).toBeNull()
  expect(listMessages).not.toHaveBeenCalled()
  const messages = await repository.listMessages(goal.goal_id)
  expect(messages).toHaveLength(2)
  const posted = messages.find((message) => message.body === body)
  expect(posted).toMatchObject({ body, goal_id: goal.goal_id })
  expect(posted?.sender).toBeUndefined()
  expect(await repository.listMessages(other.goal_id)).toEqual([])
})

it.each([['そのまま', '応援アカウント'], ['書き換え', '別の応援者名']])(
  'prefills the account name and posts the sender name (%s)',
  async (mode, expectedSender) => {
    const goal = await repository.createGoal(goalInput)
    await repository.setProfile('応援アカウント')
    await openSupportPage(goal.support_token)

    const sender = container.querySelector<HTMLInputElement>('#support-sender')!
    expect(sender.value).toBe('応援アカウント')
    if (mode === '書き換え') {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      act(() => {
        setValue.call(sender, expectedSender)
        sender.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }

    const body = '応援しています！'
    enterMessage(body)
    await act(async () => container.querySelector('button')!.click())
    expect(await repository.listMessages(goal.goal_id)).toMatchObject([{ sender: expectedSender, body }])
  },
)

it('shows a friendly message for a missing token', async () => {
  await openSupportPage('missing')
  expect(container.textContent).toContain('目標が見つかりませんでした')
  expect(container.querySelector('form')).toBeNull()
})
