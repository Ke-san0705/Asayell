import {
  createGoalTokens, defaultGoalCategory, toProfileGoal, validateGoal, validateMessageBody,
  type AsayellRepository, type Goal, type GoalInput, type InboxMessage,
  type OwnerGoal, type ProfileGoal, type PublicGoal, type RepositoryStorage, type StoredGoal, type SupportGoal, type SupportMessageInput,
} from './repository'

type GoalRow = Omit<GoalInput, 'detail' | 'isPublic'> & { detail: string | null; is_public?: boolean }
type CreatedGoalRow = GoalRow & { id: string; support_token: string; owner_token: string }
type OwnerGoalRow = GoalRow & { is_unlocked: boolean; message_count?: number }
type MessageRow = Omit<InboxMessage, 'sender' | 'message_id'> & { id?: string; sender: string | null }
type PublicGoalRow = Omit<PublicGoal, 'detail' | 'category'> & Pick<GoalRow, 'detail' | 'category'>

export class SupabaseRepository implements AsayellRepository {
  private readonly rpcUrl: string

  constructor(
    url: string,
    private readonly anonKey: string,
    private readonly storage?: RepositoryStorage,
    private readonly request: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    this.rpcUrl = url.replace(/\/+$/, '') + '/rest/v1/rpc/'
  }

  private async rpc<T>(name: string, args: Record<string, string | number | boolean | null>): Promise<T> {
    const response = await this.request(this.rpcUrl + name, {
      method: 'POST',
      headers: {
        apikey: this.anonKey,
        Authorization: 'Bearer ' + this.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    })
    if (!response.ok) throw new Error(`Supabase RPC ${name} failed (${response.status})`)
    return response.json() as Promise<T>
  }

  private get sharePrefix() {
    return `asayell:share:${this.rpcUrl}:`
  }

  async createGoal(input: GoalInput): Promise<Goal> {
    validateGoal(input)
    const storage = this.storage ?? window.localStorage
    const { support_token, owner_token } = createGoalTokens()
    const result = await this.rpc<CreatedGoalRow | CreatedGoalRow[]>('asayell_create_goal', {
      p_nickname: input.nickname,
      p_title: input.title,
      p_detail: input.detail ?? null,
      p_wake_at: input.wake_at,
      p_support_token: support_token,
      p_owner_token: owner_token,
      p_category: input.category ?? defaultGoalCategory,
      ...(input.isPublic ? { p_is_public: true } : {}),
    })
    const row = Array.isArray(result) ? result[0] : result
    if (!row?.id) throw new Error('登録した目標を取得できませんでした。')
    const goal: Goal = {
      goal_id: row.id, nickname: row.nickname, title: row.title, detail: row.detail ?? undefined,
      category: row.category ?? input.category ?? defaultGoalCategory,
      wake_at: row.wake_at, isPublic: row.is_public ?? false, support_token: row.support_token, owner_token: row.owner_token,
    }
    // The share route is opened by ID in the registering browser after navigation.
    storage.setItem(this.sharePrefix + goal.goal_id, JSON.stringify(goal))
    return goal
  }

  async getGoalById(goalId: string): Promise<Goal | null> {
    const value = (this.storage ?? window.localStorage).getItem(this.sharePrefix + goalId)
    if (value === null) return null
    const goal = JSON.parse(value) as StoredGoal
    return { ...goal, category: goal.category ?? defaultGoalCategory }
  }

  async getGoalBySupportToken(token: string): Promise<SupportGoal | null> {
    const [row] = await this.rpc<GoalRow[]>('asayell_get_goal_for_support', { p_support_token: token })
    if (!row) return null
    return {
      nickname: row.nickname, title: row.title, detail: row.detail ?? undefined,
      category: row.category ?? defaultGoalCategory,
    }
  }

  async getGoalByOwnerToken(token: string): Promise<OwnerGoal | null> {
    const [row] = await this.rpc<OwnerGoalRow[]>('asayell_get_owner_goal', { p_owner_token: token })
    if (!row) return null
    return {
      nickname: row.nickname, title: row.title, detail: row.detail ?? undefined,
      category: row.category ?? defaultGoalCategory,
      wake_at: row.wake_at, is_unlocked: row.is_unlocked, isPublic: row.is_public, message_count: row.message_count,
    }
  }

  async listOwnerGoals(): Promise<ProfileGoal[]> {
    const storage = this.storage ?? window.localStorage
    const savedGoals: StoredGoal[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key?.startsWith(this.sharePrefix)) continue
      const value = storage.getItem(key)
      if (value !== null) savedGoals.push(JSON.parse(value) as StoredGoal)
    }

    const goals = await Promise.all(savedGoals.map(async (saved) => {
      const current = await this.getGoalByOwnerToken(saved.owner_token)
      return current ? toProfileGoal(saved, current) : null
    }))
    return goals.filter((goal) => goal !== null)
  }

  async listPublicGoals(limit = 20): Promise<PublicGoal[]> {
    const rows = await this.rpc<PublicGoalRow[]>('asayell_list_public_goals', { p_limit: limit })
    return rows.map(({ nickname, title, detail, wake_at, support_token, message_count, category }) => ({
      nickname, title, detail: detail ?? undefined, wake_at, support_token, message_count,
      category: category ?? defaultGoalCategory,
    }))
  }

  async setPublic(ownerToken: string, isPublic: boolean): Promise<void> {
    const updated = await this.rpc<boolean>('asayell_set_public', {
      p_owner_token: ownerToken,
      p_is_public: isPublic,
    })
    if (updated !== true) throw new Error('公開設定を変更できませんでした。')
  }

  async hideMessage(ownerToken: string, messageId: string): Promise<void> {
    const updated = await this.rpc<boolean>('asayell_hide_message', {
      p_owner_token: ownerToken,
      p_message_id: messageId,
    })
    if (updated !== true) throw new Error('エールを隠せませんでした。')
  }

  async postMessage(supportToken: string, input: SupportMessageInput): Promise<void> {
    validateMessageBody(input.body)
    const posted = await this.rpc<boolean>('asayell_post_message', {
      p_support_token: supportToken,
      p_sender: input.sender ?? null,
      p_body: input.body,
    })
    if (posted !== true) throw new Error('エールを投稿できませんでした。')
  }

  async listOwnerMessages(ownerToken: string, demo = false): Promise<InboxMessage[]> {
    const rows = await this.rpc<MessageRow[]>('asayell_get_owner_messages', {
      p_owner_token: ownerToken,
      p_demo: demo,
    })
    return rows.map(({ id, sender, body, created_at }) => ({
      message_id: id, sender: sender ?? undefined, body, created_at,
    }))
  }
}
