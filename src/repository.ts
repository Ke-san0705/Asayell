export interface GoalInput {
  nickname: string
  title: string
  detail?: string
  /** ISO 8601 datetime for the next wake-up in Asia/Tokyo. */
  wake_at: string
}

export interface Goal extends GoalInput {
  goal_id: string
  support_token: string
  owner_token: string
}

export type SupportGoal = Pick<Goal, 'goal_id' | 'nickname' | 'title' | 'detail'>

export interface MessageInput {
  goal_id: string
  sender?: string
  body: string
}

export interface Message extends MessageInput {
  message_id: string
  created_at: string
  status: 'visible'
}

export interface AsayellRepository {
  createGoal(input: GoalInput): Promise<Goal>
  getGoalById(goalId: string): Promise<Goal | null>
  getGoalBySupportToken(token: string): Promise<SupportGoal | null>
  getGoalByOwnerToken(token: string): Promise<Goal | null>
  createMessage(input: MessageInput): Promise<Message>
  listMessages(goalId: string): Promise<Message[]>
}

type RepositoryStorage = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>

const goalPrefix = 'asayell:goal:'

function messagePrefix(goalId: string) {
  return `asayell:message:${goalId}:`
}

function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export class LocalStorageRepository implements AsayellRepository {
  constructor(private readonly storage?: RepositoryStorage) {}

  private get store(): RepositoryStorage {
    return this.storage ?? window.localStorage
  }

  private read<T>(key: string): T | null {
    const value = this.store.getItem(key)
    return value === null ? null : JSON.parse(value) as T
  }

  private *records<T>(prefix: string): IterableIterator<T> {
    const storage = this.store
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key?.startsWith(prefix)) continue
      const record = this.read<T>(key)
      if (record !== null) yield record
    }
  }

  async createGoal(input: GoalInput): Promise<Goal> {
    const { nickname, title, detail, wake_at } = input
    if (!nickname.trim() || nickname.length > 20 || !title.trim() || title.length > 100 ||
        (detail !== undefined && detail.length > 300)) {
      throw new RangeError('目標の入力内容を確認してください。')
    }

    const goal: Goal = {
      nickname, title, detail, wake_at,
      goal_id: crypto.randomUUID(),
      support_token: createToken(),
      owner_token: createToken(),
    }
    while (goal.owner_token === goal.support_token) goal.owner_token = createToken()
    this.store.setItem(goalPrefix + goal.goal_id, JSON.stringify(goal))
    return goal
  }

  async getGoalById(goalId: string): Promise<Goal | null> {
    return this.read<Goal>(goalPrefix + goalId)
  }

  async getGoalBySupportToken(token: string): Promise<SupportGoal | null> {
    for (const goal of this.records<Goal>(goalPrefix)) {
      if (goal.support_token === token) {
        const { goal_id, nickname, title, detail } = goal
        return { goal_id, nickname, title, detail }
      }
    }
    return null
  }

  async getGoalByOwnerToken(token: string): Promise<Goal | null> {
    for (const goal of this.records<Goal>(goalPrefix)) {
      if (goal.owner_token === token) return goal
    }
    return null
  }

  async createMessage(input: MessageInput): Promise<Message> {
    const { goal_id, sender, body } = input
    if (!body.trim() || body.length > 150) {
      throw new RangeError('エールは150文字以内で入力してください。')
    }
    if (!await this.getGoalById(goal_id)) {
      throw new Error('目標が見つかりません。')
    }

    const message: Message = {
      goal_id, sender, body,
      message_id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      status: 'visible',
    }
    this.store.setItem(messagePrefix(goal_id) + message.message_id, JSON.stringify(message))
    return message
  }

  async listMessages(goalId: string): Promise<Message[]> {
    return [...this.records<Message>(messagePrefix(goalId))]
      .sort((first, second) => first.created_at.localeCompare(second.created_at))
  }
}
