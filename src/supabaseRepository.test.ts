import { expect, it, vi } from 'vitest'
import { SupabaseRepository } from './supabaseRepository'

it('registers, shares and receives across browsers using only token-scoped RPCs', async () => {
  const url = 'https://example.supabase.co'
  const input = { nickname: 'あさ', title: '散歩', wake_at: '2026-11-29T07:00:00+09:00' }
  const body = '応援しています'
  const response = (data: unknown) => Response.json(data)
  const creation = vi.fn<typeof fetch>().mockImplementationOnce(async (_url, options) => {
    const args = JSON.parse(String(options?.body))
    expect(args).toEqual({
      p_nickname: input.nickname, p_title: input.title, p_detail: null, p_wake_at: input.wake_at,
      p_support_token: expect.stringMatching(/^[a-f0-9]{32}$/),
      p_owner_token: expect.stringMatching(/^[a-f0-9]{32}$/),
    })
    expect(args.p_support_token).not.toBe(args.p_owner_token)
    return response([{ ...input, detail: null, id: 'goal-id',
      owner_token: args.p_owner_token, support_token: args.p_support_token }])
  })
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
  }
  const goal = await new SupabaseRepository(url, 'anon', storage, creation).createGoal(input)
  expect(goal.goal_id).toBe('goal-id')
  const rpc = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response([{ ...input, detail: null }]))
    .mockResolvedValueOnce(response(true))
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response([{ ...input, detail: null, message_count: 1, is_unlocked: false }]))
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response([{ sender: null, body, created_at: input.wake_at }]))

  const owner = new SupabaseRepository(url, 'anon', storage, rpc)
  const supporter = new SupabaseRepository(url, 'anon', { ...storage, getItem: () => null }, rpc)
  expect(await owner.getGoalById(goal.goal_id)).toEqual(goal)
  expect(await supporter.getGoalById(goal.goal_id)).toBeNull()
  expect(await supporter.getGoalBySupportToken(goal.support_token))
    .toEqual({ nickname: input.nickname, title: input.title, detail: undefined })
  await supporter.postMessage(goal.support_token, { body })
  expect(await supporter.getGoalByOwnerToken(goal.support_token)).toBeNull()
  expect(await owner.getGoalByOwnerToken(goal.owner_token)).toMatchObject({ is_unlocked: false })
  expect(await owner.listOwnerMessages(goal.owner_token)).toEqual([])
  expect(await owner.listOwnerMessages(goal.owner_token, true)).toEqual([
    { sender: undefined, body, created_at: input.wake_at },
  ])

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
