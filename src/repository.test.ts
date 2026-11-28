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
    const goal = await repository.createGoal({ ...goalInput, category: 'dream' })
    const reopened = new LocalStorageRepository(storage)
    expect(goal).toMatchObject({ ...goalInput, category: 'dream' })
    expect(goal.goal_id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/)
    expect(await reopened.getGoalById(goal.goal_id)).toEqual(goal)
    expect(await reopened.getGoalByOwnerToken(goal.owner_token)).toEqual(goal)
    expect(await reopened.getGoalBySupportToken(goal.support_token)).toEqual({
      goal_id: goal.goal_id,
      nickname: goal.nickname,
      title: goal.title,
      detail: goal.detail,
      category: 'dream',
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

  it('preserves the first consented response and its timestamp when a phase is retried', async () => {
    const { repository, storage } = setup()
    const goal = await repository.createGoal(goalInput)
    const response = { phase: 'pre' as const, isDemo: true, q1: 1, q2: 2, q3: 3, consent: true }

    await expect(repository.saveSurveyResponse(goal.owner_token, { ...response, consent: false })).rejects.toThrow()
    expect(await repository.listSurveyResponses()).toEqual([])
    await repository.saveSurveyResponse(goal.owner_token, response)
    const first = await repository.listSurveyResponses()
    expect(first).toEqual([{
      goal_id: goal.goal_id, phase: 'pre', is_demo: true, q1: 1, q2: 2, q3: 3,
      continue_intent: null, created_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
    }])

    const reopened = new LocalStorageRepository(storage)
    await reopened.saveSurveyResponse(goal.owner_token, { ...response, isDemo: false, q1: 5 })
    expect(await reopened.getSurveyStatus(goal.owner_token)).toEqual(['pre'])
    expect(await reopened.listSurveyResponses()).toEqual(first)
  })
})


it('publishes only upcoming opted-in goals and excludes hidden messages from counts', async () => {
  const { storage, repository } = setup()
  const wake_at = new Date(Date.now() + 60_000).toISOString()
  const goal = await repository.createGoal({ ...goalInput, wake_at })
  await repository.createGoal({ ...goalInput, wake_at: '2020-01-01T00:00:00Z', isPublic: true })
  const message = await repository.createMessage({ goal_id: goal.goal_id, body: 'エール' })
  expect(goal.isPublic).toBe(false)
  expect(await repository.listPublicGoals()).toEqual([])
  await expect(repository.setPublic(goal.support_token, true)).rejects.toThrow()
  await repository.setPublic(goal.owner_token, true)
  const reopened = new LocalStorageRepository(storage)
  expect((await reopened.getGoalByOwnerToken(goal.owner_token))?.isPublic).toBe(true)
  expect(await reopened.listPublicGoals()).toEqual([{
    ...goalInput, wake_at, category: 'goal', support_token: goal.support_token, message_count: 1,
  }])
  await expect(reopened.hideMessage(goal.support_token, message.message_id)).rejects.toThrow()
  await reopened.hideMessage(goal.owner_token, message.message_id)
  expect(await repository.listOwnerMessages(goal.owner_token, true)).toEqual([])
  expect((await repository.listPublicGoals())[0].message_count).toBe(0)
  await reopened.setPublic(goal.owner_token, false)
  expect(await repository.listPublicGoals()).toEqual([])
})

it('lists only device goals with counts before wake-up', async () => {
  const { repository, storage } = setup()
  const goal = await repository.createGoal({
    nickname: 'あさ', title: '散歩', category: 'fun', wake_at: '2099-01-01T07:00:00+09:00',
  })
  await repository.postMessage(goal.support_token, { body: '応援しています' })
  await repository.setPublic(goal.owner_token, true)
  const other = await repository.createGoal({
    nickname: 'あさ', title: '読書', wake_at: '2099-01-01T08:00:00+09:00',
  })
  const reopened = new LocalStorageRepository(storage)
  expect(await reopened.listOwnerGoals()).toEqual(expect.arrayContaining([{
    goalId: goal.goal_id, ownerToken: goal.owner_token, supportToken: goal.support_token,
    title: goal.title, category: 'fun', wakeAt: goal.wake_at, isPublic: true, messageCount: 1,
  }, {
    goalId: other.goal_id, ownerToken: other.owner_token, supportToken: other.support_token,
    title: other.title, category: 'goal', wakeAt: other.wake_at, isPublic: false, messageCount: 0,
  }]))
  expect(await setup().repository.listOwnerGoals()).toEqual([])
})

it('defaults legacy goals without a category to 目標', async () => {
  const { entries, repository } = setup()
  entries.set('asayell:goal:legacy', JSON.stringify({
    ...goalInput, goal_id: 'legacy', owner_token: 'owner', support_token: 'support',
  }))
  expect(await repository.getGoalById('legacy')).toMatchObject({ category: 'goal' })
  expect(await repository.getGoalByOwnerToken('owner')).toMatchObject({ category: 'goal' })
  expect(await repository.getGoalBySupportToken('support')).toMatchObject({ category: 'goal' })
  expect(await repository.listOwnerGoals()).toMatchObject([{ category: 'goal' }])
})

it('keeps a random device identity and account name across repository instances', async () => {
  const { entries, storage, repository } = setup()
  expect(await repository.getProfile()).toBeNull()
  const deviceId = entries.get('asayell:device-id')
  expect(deviceId).toMatch(/^[0-9a-f]{32}$/)
  const separate = setup()
  await separate.repository.getProfile()
  expect(separate.entries.get('asayell:device-id')).not.toBe(deviceId)

  const input = { title: goalInput.title, wake_at: goalInput.wake_at }
  await expect(repository.createGoal(input)).rejects.toThrow('アカウント名')
  const legacy = await repository.createGoal(goalInput)
  await expect(repository.setProfile('   ')).rejects.toThrow(RangeError)
  await expect(repository.setProfile('🌅'.repeat(21))).rejects.toThrow(RangeError)
  await repository.setProfile('🌅'.repeat(20))
  const reopened = new LocalStorageRepository(storage)
  expect(await reopened.getProfile()).toEqual({ accountName: '🌅'.repeat(20) })
  expect(entries.get('asayell:device-id')).toBe(deviceId)
  const first = await reopened.createGoal(input)
  expect(first.nickname).toBe('🌅'.repeat(20))

  await reopened.setProfile('あさの名前')
  expect(await reopened.getProfile()).toEqual({ accountName: 'あさの名前' })
  expect((await reopened.createGoal(input)).nickname).toBe('あさの名前')
  expect((await reopened.getGoalByOwnerToken(first.owner_token))?.nickname).toBe(first.nickname)
  expect(await reopened.listOwnerGoals()).toEqual(expect.arrayContaining([
    expect.objectContaining({ ownerToken: legacy.owner_token }),
    expect.objectContaining({ ownerToken: first.owner_token }),
  ]))
})
