import { expect, type BrowserContext } from '@playwright/test'

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
}
type MessageRow = { body: string | null; sender: string | null; created_at: string }

export function createSupabaseFixture() {
  let goal: GoalRow | undefined
  const messages: MessageRow[] = []
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
        const args = request.postDataJSON() as RpcArgs & { p_demo?: boolean }
        const path = new URL(request.url()).pathname
        const supportGoal = goal && goal.support_token === args.p_support_token ? goal : undefined
        const ownerGoal = goal && goal.owner_token === args.p_owner_token ? goal : undefined
        const publicFields = ({ nickname, title, detail, wake_at }: GoalRow) => ({
          nickname, title, detail, wake_at,
        })

        switch (path) {
          case rpcPath + 'asayell_create_goal':
            goal = {
              id: 'e2e-goal',
              nickname: args.p_nickname,
              title: args.p_title,
              detail: args.p_detail,
              wake_at: args.p_wake_at!,
              support_token: args.p_support_token,
              owner_token: args.p_owner_token,
            }
            await route.fulfill({ json: goal })
            break
          case rpcPath + 'asayell_get_goal_for_support':
            await route.fulfill({ json: supportGoal ? [publicFields(supportGoal)] : [] })
            break
          case rpcPath + 'asayell_post_message':
            if (supportGoal) {
              messages.push({ body: args.p_body, sender: args.p_sender, created_at: new Date().toISOString() })
            }
            await route.fulfill({ json: Boolean(supportGoal) })
            break
          case rpcPath + 'asayell_get_owner_goal':
            await route.fulfill({
              json: ownerGoal ? [{ ...publicFields(ownerGoal), is_unlocked: unlocked, message_count: messages.length }] : [],
            })
            break
          case rpcPath + 'asayell_get_owner_messages':
            expect(typeof args.p_demo).toBe('boolean')
            await route.fulfill({ json: ownerGoal && (unlocked || args.p_demo) ? messages : [] })
            break
          default:
            throw new Error('Unexpected request to Supabase: ' + path)
        }
      })
    },
  }
}
