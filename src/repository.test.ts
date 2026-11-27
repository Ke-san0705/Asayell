import { describe, expect, it } from 'vitest'
import { LocalStorageRepository } from './repository'

function setup() {
  const entries = new Map<string, string>()
  const storage = {
    get length() { return entries.size },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
  }
  return { storage, entries, repository: new LocalStorageRepository(storage) }
}

const goalInput = {
  nickname: 'あさ',
  title: '朝の散歩',
  detail: '公園まで歩く',
  wake_at: '2026-11-29T07:00:00+09:00',
}

describe('LocalStorageRepository', () => {
  it('persists goals and looks them up by ID and either token after reopening', async () => {
    const { storage, entries, repository } = setup()
    const goal = await repository.createGoal(goalInput)
    const reopened = new LocalStorageRepository(storage)
    expect(goal).toMatchObject(goalInput)
    expect(goal.goal_id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/)
    expect(await reopened.getGoalById(goal.goal_id)).toEqual(goal)
    expect(await reopened.getGoalByOwnerToken(goal.owner_token)).toEqual(goal)
    expect(await reopened.getGoalBySupportToken(goal.support_token)).toEqual({
      goal_id: goal.goal_id,
      nickname: goal.nickname,
      title: goal.title,
      detail: goal.detail,
    })
    expect([...entries.keys()]).toEqual([`asayell:goal:${goal.goal_id}`])
    expect(await reopened.getGoalById('missing')).toBeNull()
  })

  it.each(['', '2026-11-29T07:00:00', '2026-11-29T25:00:00+09:00'])(
    'rejects an invalid or timezone-less wake_at (%s) without writing',
    async (wake_at) => {
      const { entries, repository } = setup()
      await expect(repository.createGoal({ ...goalInput, wake_at })).rejects.toThrow(RangeError)
      expect(entries.size).toBe(0)
    },
  )

  it('issues distinct URL-safe tokens that work only in their assigned lookup', async () => {
    const { repository } = setup()
    const first = await repository.createGoal(goalInput)
    const second = await repository.createGoal(goalInput)
    const tokens = [first.support_token, first.owner_token, second.support_token, second.owner_token]
    expect(new Set(tokens).size).toBe(4)
    for (const token of tokens) expect(token).toMatch(/^[0-9a-f]{32}$/)
    expect(await repository.getGoalByOwnerToken(first.support_token)).toBeNull()
    expect(await repository.getGoalBySupportToken(first.owner_token)).toBeNull()
  })

  it('persists visible messages and returns only messages for the requested goal', async () => {
    const { repository, storage } = setup()
    const goal = await repository.createGoal(goalInput)
    const another = await repository.createGoal(goalInput)
    const message = await repository.createMessage({ goal_id: goal.goal_id, body: '応援しています' })
    expect(message).toMatchObject({ goal_id: goal.goal_id, body: '応援しています', status: 'visible' })
    expect(await new LocalStorageRepository(storage).listMessages(goal.goal_id)).toEqual([message])
    expect(await repository.listMessages(another.goal_id)).toEqual([])
  })
})
