import { expect, it, vi } from 'vitest'
import { SupabaseRepository } from './supabaseRepository'

it('shares and receives across browsers and merges device goals with legacy receipts', async () => {
  const url = 'https://example.supabase.co'
  const input = { nickname: 'あさ', title: '散歩', category: 'dream' as const, wake_at: '2026-11-29T07:00:00+09:00' }
  const body = '応援しています'
  const response = (data: unknown) => Response.json(data)
  const creation = vi.fn<typeof fetch>().mockImplementationOnce(async (_url, options) => {
    const args = JSON.parse(String(options?.body))
    expect(args).toEqual({
      p_nickname: input.nickname, p_title: input.title, p_detail: null, p_wake_at: input.wake_at,
      p_support_token: expect.stringMatching(/^[a-f0-9]{32}$/),
      p_owner_token: expect.stringMatching(/^[a-f0-9]{32}$/), p_is_public: true, p_category: input.category,
    })
    expect(args.p_support_token).not.toBe(args.p_owner_token)
    return response([{ ...input, detail: null, id: 'goal-id', is_public: true,
      owner_token: args.p_owner_token, support_token: args.p_support_token }])
  })
  const entries = new Map<string, string>()
  const storage = {
    get length() { return entries.size },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
  }
  const goal = await new SupabaseRepository(url, 'anon', storage, creation).createGoal({ ...input, isPublic: true })
  expect(goal).toMatchObject({ goal_id: 'goal-id', isPublic: true, category: input.category })
  const rpc = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response([{ ...input, detail: null }]))
    .mockResolvedValueOnce(response(true))
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response([{ ...input, detail: null, message_count: 1, is_unlocked: false, is_public: true }]))
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response([{ id: 'message-id', sender: null, body, created_at: input.wake_at }]))
    .mockResolvedValueOnce(response([
      { title: '端末から登録した夢', wake_at: input.wake_at, is_public: true, category: 'fun', message_count: 2,
        support_token: 'device-support', owner_token: 'device-owner' },
    ]))
    .mockResolvedValueOnce(response([{ ...input, detail: null, message_count: 1, is_unlocked: false, is_public: true }]))

  const owner = new SupabaseRepository(url, 'anon', storage, rpc)
  const supporter = new SupabaseRepository(url, 'anon', { ...storage, getItem: () => null }, rpc)
  expect(await owner.getGoalById(goal.goal_id)).toEqual(goal)
  expect(await supporter.getGoalById(goal.goal_id)).toBeNull()
  expect(await supporter.getGoalBySupportToken(goal.support_token))
    .toEqual({ nickname: input.nickname, title: input.title, detail: undefined, category: input.category })
  await supporter.postMessage(goal.support_token, { body })
  expect(await supporter.getGoalByOwnerToken(goal.support_token)).toBeNull()
  expect(await owner.getGoalByOwnerToken(goal.owner_token)).toMatchObject({ is_unlocked: false, isPublic: true, category: input.category })
  expect(await owner.listOwnerMessages(goal.owner_token)).toEqual([])
  expect(await owner.listOwnerMessages(goal.owner_token, true)).toEqual([
    { message_id: 'message-id', sender: undefined, body, created_at: input.wake_at },
  ])
  const goals = await owner.listOwnerGoals()
  expect(goals).toEqual([
    { ownerToken: 'device-owner', supportToken: 'device-support', title: '端末から登録した夢',
      wakeAt: input.wake_at, isPublic: true, category: 'fun', messageCount: 2 },
    { goalId: goal.goal_id, ownerToken: goal.owner_token, supportToken: goal.support_token, title: goal.title,
      wakeAt: input.wake_at, isPublic: true, category: input.category, messageCount: 1 },
  ])

  const deviceOnlyRpc = vi.fn<typeof fetch>().mockResolvedValueOnce(response([
    { title: goal.title, wake_at: input.wake_at, is_public: false, category: input.category, message_count: 3,
      support_token: goal.support_token, owner_token: goal.owner_token },
  ]))
  const reopened = new SupabaseRepository(url, 'anon', storage, deviceOnlyRpc)
  expect(await reopened.listOwnerGoals()).toEqual([
    { ownerToken: goal.owner_token, supportToken: goal.support_token, title: goal.title,
      wakeAt: input.wake_at, isPublic: false, category: input.category, messageCount: 3 },
  ])
  expect(deviceOnlyRpc).toHaveBeenCalledTimes(1)

  const beforeMigration = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(response([{ ...input, is_public: true, message_count: 1 }]))
  const legacyRepository = new SupabaseRepository(url, 'anon', storage, beforeMigration)
  expect(await legacyRepository.listOwnerGoals()).toEqual([goals[1]])

  expect(creation.mock.calls[0][0]).toBe(url + '/rest/v1/rpc/asayell_create_goal')
  expect(rpc.mock.calls.map(([path, options]) => {
    expect(options).toMatchObject({
      method: 'POST',
      headers: { apikey: 'anon', Authorization: 'Bearer anon', 'Content-Type': 'application/json' },
    })
    return [path, JSON.parse(String(options?.body))]
  })).toEqual([
    [url + '/rest/v1/rpc/asayell_get_goal_for_support', { p_support_token: goal.support_token }],
    [url + '/rest/v1/rpc/asayell_post_message', { p_support_token: goal.support_token, p_sender: null, p_body: body }],
    [url + '/rest/v1/rpc/asayell_get_owner_goal', { p_owner_token: goal.support_token }],
    [url + '/rest/v1/rpc/asayell_get_owner_goal', { p_owner_token: goal.owner_token }],
    [url + '/rest/v1/rpc/asayell_get_owner_messages', { p_owner_token: goal.owner_token, p_demo: false }],
    [url + '/rest/v1/rpc/asayell_get_owner_messages', { p_owner_token: goal.owner_token, p_demo: true }],
    [url + '/rest/v1/rpc/asayell_list_my_goals', { p_device_id: expect.stringMatching(/^[a-f0-9]{32}$/) }],
    [url + '/rest/v1/rpc/asayell_get_owner_goal', { p_owner_token: goal.owner_token }],
  ])
})

it('propagates HTTP failures and rejects unsuccessful posts', async () => {
  const rpc = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json(false))
  const repository = new SupabaseRepository('https://example.supabase.co', 'anon', undefined, rpc)
  await expect(repository.getGoalBySupportToken('token')).rejects.toThrow('503')
  await expect(repository.postMessage('token', { body: 'エール' })).rejects.toThrow()
})


it('uses the public listing and owner mutation RPCs and checks their results', async () => {
  const url = 'https://example.supabase.co'
  const rpc = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json([]))
    .mockResolvedValueOnce(Response.json(true))
    .mockResolvedValueOnce(Response.json(false))
  const repository = new SupabaseRepository(url, 'anon', undefined, rpc)
  expect(await repository.listPublicGoals(7)).toEqual([])
  await repository.setPublic('owner', false)
  await expect(repository.hideMessage('owner', 'message')).rejects.toThrow()

  expect(rpc.mock.calls.map(([path, options]) => [path, JSON.parse(String(options?.body))]))
    .toEqual([
      [url + '/rest/v1/rpc/asayell_list_public_goals', { p_limit: 7 }],
      [url + '/rest/v1/rpc/asayell_set_public', { p_owner_token: 'owner', p_is_public: false }],
      [url + '/rest/v1/rpc/asayell_hide_message', { p_owner_token: 'owner', p_message_id: 'message' }],
    ])
})

it('uses the same device ID for profile RPCs and account-based goal creation', async () => {
  const url = 'https://example.supabase.co'
  const entries = new Map<string, string>()
  const storage = {
    length: 0, key: () => null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
  }
  const row = { account_name: 'あさ', created_at: '2026-11-28T00:00:00Z' }
  const input = { title: '散歩', wake_at: '2026-11-29T07:00:00+09:00' }
  const rpc = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json([]))
    .mockResolvedValueOnce(new Response(null, { status: 400 }))
    .mockResolvedValueOnce(Response.json(row))
    .mockResolvedValueOnce(Response.json([row]))
    .mockImplementationOnce(async (_path, options) => {
      const args = JSON.parse(String(options?.body))
      return Response.json({ ...input, id: 'goal', nickname: row.account_name,
        owner_token: args.p_owner_token, support_token: args.p_support_token, detail: null })
    })
  const repository = new SupabaseRepository(url, 'anon', storage, rpc)
  expect(await repository.getProfile()).toBeNull()
  await expect(repository.createGoal(input)).rejects.toThrow('400')
  await expect(repository.setProfile('あ'.repeat(21))).rejects.toThrow(RangeError)
  expect(await repository.setProfile('あさ')).toEqual({ accountName: 'あさ' })
  const reopened = new SupabaseRepository(url, 'anon', storage, rpc)
  expect(await reopened.getProfile()).toEqual({ accountName: 'あさ' })
  expect(await reopened.createGoal(input)).toMatchObject({ nickname: 'あさ' })

  const deviceId = entries.get('asayell:device-id')
  expect(deviceId).toMatch(/^[0-9a-f]{32}$/)
  expect(rpc.mock.calls.map(([path, options]) => {
    expect(options?.method).toBe('POST')
    const args = JSON.parse(String(options?.body))
    expect(args.p_device_id).toBe(deviceId)
    if (String(path).endsWith('create_goal')) expect(args.p_nickname).toBeNull()
    if (String(path).endsWith('upsert_profile')) expect(args.p_account_name).toBe('あさ')
    return path
  })).toEqual(['get_profile', 'create_goal', 'upsert_profile', 'get_profile', 'create_goal']
    .map(name => url + '/rest/v1/rpc/asayell_' + name))
})

it('uses the survey RPCs with owner token, phase, demo flag and post-only intent', async () => {
  const url = 'https://example.supabase.co'
  const rpc = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json('ok'))
    .mockResolvedValueOnce(Response.json('ok'))
    .mockResolvedValueOnce(Response.json([{ phase: 'pre' }, { phase: 'post' }]))
  const repository = new SupabaseRepository(url, 'anon', undefined, rpc)
  const scores = { q1: 1, q2: 3, q3: 5, consent: true }

  await repository.saveSurveyResponse('owner', { ...scores, phase: 'pre', isDemo: true })
  await repository.saveSurveyResponse('owner', { ...scores, phase: 'post', isDemo: false, continueIntent: 4 })
  expect(await repository.getSurveyStatus('owner')).toEqual(['pre', 'post'])

  const path = url + '/rest/v1/rpc/'
  const payload = { p_owner_token: 'owner', p_q1: 1, p_q2: 3, p_q3: 5, p_consent: true }
  expect(rpc.mock.calls.map(([request, options]) => [request, JSON.parse(String(options?.body))])).toEqual([
    [path + 'asayell_save_survey_response', { ...payload, p_phase: 'pre', p_is_demo: true, p_continue_intent: null }],
    [path + 'asayell_save_survey_response', { ...payload, p_phase: 'post', p_is_demo: false, p_continue_intent: 4 }],
    [path + 'asayell_get_survey_status', { p_owner_token: 'owner' }],
  ])
})

it('requests only the scalar message count for the owner token', async () => {
  const url = 'https://example.supabase.co'
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(2))
  const repository = new SupabaseRepository(url, 'anon', undefined, request)

  expect(await repository.getMessageCount('owner')).toBe(2)
  expect(request).toHaveBeenCalledExactlyOnceWith(url + '/rest/v1/rpc/asayell_get_message_count',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ p_owner_token: 'owner' }) }))
})
