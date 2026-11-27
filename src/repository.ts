export interface GoalInput {
  nickname: string
  title: string
  detail?: string
  /** Next wake-up in Asia/Tokyo, supplied as an ISO 8601 timestamp with an offset or Z. */
  wake_at: string
}

export interface Goal extends GoalInput {
  goal_id: string
  support_token: string
  owner_token: string
}

export type SupportGoal = Pick<Goal, 'nickname' | 'title' | 'detail'>
export type OwnerGoal = GoalInput & { is_unlocked?: boolean }

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

export type SupportMessageInput = Pick<MessageInput, 'sender' | 'body'>
export type InboxMessage = Pick<Message, 'sender' | 'body' | 'created_at'>

export interface AsayellRepository {
  createGoal(input: GoalInput): Promise<Goal>
  getGoalById(goalId: string): Promise<Goal | null>
  getGoalBySupportToken(token: string): Promise<SupportGoal | null>
  getGoalByOwnerToken(token: string): Promise<OwnerGoal | null>
  postMessage(supportToken: string, input: SupportMessageInput): Promise<void>
  listOwnerMessages(ownerToken: string, demo?: boolean): Promise<InboxMessage[]>
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

export function createGoalTokens() {
  const support_token = createToken()
  let owner_token = createToken()
  while (owner_token === support_token) owner_token = createToken()
  return { support_token, owner_token }
}

export function validateGoal({ nickname, title, detail, wake_at }: GoalInput) {
  if (!nickname.trim() || nickname.length > 20 || !title.trim() || title.length > 100 ||
      (detail !== undefined && detail.length > 300)) {
    throw new RangeError('目標の入力内容を確認してください。')
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(wake_at) ||
      !Number.isFinite(Date.parse(wake_at))) {
    throw new RangeError('タイムゾーン付きの起床予定日時を入力してください。')
  }
}

export function validateMessageBody(body: string) {
  if (!body.trim() || body.length > 150) {
    throw new RangeError('エールは150文字以内で入力してください。')
  }
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
    validateGoal(input)

    const goal: Goal = {
      nickname, title, detail, wake_at,
      goal_id: crypto.randomUUID(),
      ...createGoalTokens(),
    }
    this.store.setItem(goalPrefix + goal.goal_id, JSON.stringify(goal))
    return goal
  }

  async getGoalById(goalId: string): Promise<Goal | null> {
    return this.read<Goal>(goalPrefix + goalId)
  }

  async getGoalBySupportToken(token: string): Promise<(SupportGoal & Pick<Goal, 'goal_id'>) | null> {
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

  async postMessage(supportToken: string, input: SupportMessageInput): Promise<void> {
    const goal = await this.getGoalBySupportToken(supportToken)
    if (!goal) throw new Error('目標が見つかりません。')
    await this.createMessage({ ...input, goal_id: goal.goal_id })
  }

  async listOwnerMessages(ownerToken: string, demo = false): Promise<InboxMessage[]> {
    const goal = await this.getGoalByOwnerToken(ownerToken)
    if (!goal || (!demo && Date.now() < Date.parse(goal.wake_at))) return []
    return this.listMessages(goal.goal_id)
  }

  async createMessage(input: MessageInput): Promise<Message> {
    const { goal_id, sender, body } = input
    validateMessageBody(body)
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
