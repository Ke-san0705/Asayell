import { expect, type BrowserContext } from '@playwright/test'
import type { SurveyResponseRow } from '../src/repository'

export const rpcPath = '/rest/v1/rpc/'
export const fixtureUrl = 'https://asayell-e2e.test'
export const fixtureKey = 'e2e-anon-key'

type RpcArgs = Record<string, string | null>
type GoalRow = {
  id: string
  nickname: string | null
  title: string | null
  detail: string | null
  wake_at: string
  support_token: string | null
  owner_token: string | null
  category: string
  is_public: boolean
}
type MessageRow = { id: string; body: string | null; sender: string | null; created_at: string }

export function createSupabaseFixture(now = Date.now) {
  const profiles = new Map<string, { account_name: string }>()
  const goals: Array<GoalRow & { deviceId: string | null; messages: MessageRow[] }> = []
  const surveys: SurveyResponseRow[] = []
  let unlocked = false

  return {
    unlock() {
      unlocked = true
    },
    async install(context: BrowserContext) {
      await context.route(fixtureUrl + '/**', async route => {
        const request = route.request()
        expect(request.method()).toBe('POST')
        expect(request.headers()).toMatchObject({
          apikey: fixtureKey,
          authorization: 'Bearer ' + fixtureKey,
        })
        const args = request.postDataJSON() as RpcArgs & {
          p_demo?: boolean; p_is_public?: boolean; p_limit?: number
          p_phase: SurveyResponseRow['phase']; p_is_demo: boolean; p_consent: boolean
          p_q1: number; p_q2: number; p_q3: number; p_continue_intent: number | null
        }
        const path = new URL(request.url()).pathname
        const supportGoal = goals.find(goal => goal.support_token === args.p_support_token)
        const ownerGoal = goals.find(goal => goal.owner_token === args.p_owner_token)
        const publicFields = ({ nickname, title, detail, wake_at, category }: GoalRow) => ({
          nickname, title, detail, wake_at, category,
        })

        switch (path) {
          case rpcPath + 'asayell_get_profile': {
            const profile = profiles.get(args.p_device_id!)
            await route.fulfill({ json: profile ? [profile] : [] })
            break
          }
          case rpcPath + 'asayell_upsert_profile': {
            expect(args.p_device_id).toMatch(/^[0-9a-f]{32}$/)
            const profile = { account_name: args.p_account_name! }
            profiles.set(args.p_device_id!, profile)
            await route.fulfill({ json: profile })
            break
          }
          case rpcPath + 'asayell_create_goal': {
            const deviceId = args.p_device_id ?? null
            const profile = deviceId ? profiles.get(deviceId) : undefined
            if (deviceId) {
              expect(deviceId).toMatch(/^[0-9a-f]{32}$/)
              expect(args.p_nickname).toBeNull()
              if (!profile) {
                await route.fulfill({ status: 400, json: { message: 'profile not found for device' } })
                break
              }
            }
            const goal = {
              id: crypto.randomUUID(),
              nickname: profile?.account_name ?? args.p_nickname,
              title: args.p_title,
              detail: args.p_detail,
              wake_at: args.p_wake_at!,
              support_token: args.p_support_token,
              owner_token: args.p_owner_token,
              category: args.p_category ?? 'goal',
              is_public: args.p_is_public ?? false,
            }
            goals.unshift({ ...goal, deviceId, messages: [] })
            await route.fulfill({ json: goal })
            break
          }
          case rpcPath + 'asayell_list_my_goals': {
            expect(args.p_device_id).toMatch(/^[0-9a-f]{32}$/)
            const owned = goals.filter(goal => goal.deviceId === args.p_device_id)
            await route.fulfill({ json: owned.map(({ title, wake_at, is_public, category, support_token, owner_token, messages }) => ({
              title, wake_at, is_public, category, support_token, owner_token, message_count: messages.length,
            })) })
            break
          }
          case rpcPath + 'asayell_list_public_goals':
            expect(args).toEqual({ p_limit: 20 })
            await route.fulfill({
              json: goals.filter(goal => goal.is_public && Date.parse(goal.wake_at) > now()).map(goal => ({
                ...publicFields(goal), support_token: goal.support_token, message_count: goal.messages.length,
              })),
            })
            break
          case rpcPath + 'asayell_get_goal_for_support':
            await route.fulfill({ json: supportGoal ? [publicFields(supportGoal)] : [] })
            break
          case rpcPath + 'asayell_post_message':
            if (supportGoal) {
              supportGoal.messages.push({
                id: crypto.randomUUID(), body: args.p_body, sender: args.p_sender, created_at: new Date().toISOString(),
              })
            }
            await route.fulfill({ json: Boolean(supportGoal) })
            break
          case rpcPath + 'asayell_get_owner_goal':
            await route.fulfill({
              json: ownerGoal ? [{
                ...publicFields(ownerGoal), is_unlocked: unlocked, message_count: ownerGoal.messages.length, is_public: ownerGoal.is_public,
              }] : [],
            })
            break
          case rpcPath + 'asayell_get_survey_status':
            await route.fulfill({ json: surveys.filter(row => row.goal_id === ownerGoal?.id)
              .map(({ phase }) => ({ phase })) })
            break
          case rpcPath + 'asayell_save_survey_response': {
            expect(ownerGoal).toBeDefined()
            expect(args.p_consent).toBe(true)
            if (ownerGoal && !surveys.some(row => row.goal_id === ownerGoal.id && row.phase === args.p_phase)) {
              surveys.push({
                goal_id: ownerGoal.id,
                phase: args.p_phase,
                is_demo: args.p_is_demo,
                q1: args.p_q1,
                q2: args.p_q2,
                q3: args.p_q3,
                continue_intent: args.p_continue_intent,
                created_at: new Date(now()).toISOString(),
              })
            }
            await route.fulfill({ json: 'ok' })
            break
          }
          case rpcPath + 'asayell_list_survey_responses':
            await route.fulfill({ json: surveys })
            break
          case rpcPath + 'asayell_get_message_count':
            await route.fulfill({ json: ownerGoal ? ownerGoal.messages.length : 0 })
            break
          case rpcPath + 'asayell_get_owner_messages':
            expect(typeof args.p_demo).toBe('boolean')
            await route.fulfill({ json: ownerGoal && (unlocked || args.p_demo) ? ownerGoal.messages : [] })
            break
          case rpcPath + 'asayell_set_public':
            if (ownerGoal) ownerGoal.is_public = args.p_is_public ?? false
            await route.fulfill({ json: Boolean(ownerGoal) })
            break
          case rpcPath + 'asayell_hide_message': {
            const index = ownerGoal?.messages.findIndex(({ id }) => id === args.p_message_id) ?? -1
            const hidden = index >= 0
            if (hidden) ownerGoal?.messages.splice(index, 1)
            await route.fulfill({ json: hidden })
            break
          }
          default:
            throw new Error('Unexpected request to Supabase: ' + path)
        }
      })
    },
  }
}
