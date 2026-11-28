export const goalCategoryLabels = { dream: '夢', goal: '目標', fun: '楽しみ' } as const
export type GoalCategory = keyof typeof goalCategoryLabels
export const defaultGoalCategory: GoalCategory = 'goal'

export interface GoalInput {
  nickname: string
  title: string
  detail?: string
  category?: GoalCategory
  isPublic?: boolean
  /** Next wake-up in Asia/Tokyo, supplied as an ISO 8601 timestamp with an offset or Z. */
  wake_at: string
}

export type CreateGoalInput = Omit<GoalInput, 'nickname'> & {
  /** Legacy nickname. When omitted, use the account name for this device. */
  nickname?: string
}

export interface Profile {
  accountName: string
}

export const accountNameLimit = 20

export function normalizeAccountName(value: string) {
  const name = value.trim()
  if (!name || [...name].length > accountNameLimit || name.includes('\0')) {
    throw new RangeError('アカウント名は1〜20文字で入力してください。')
  }
  return name
}

export interface Goal extends GoalInput {
  category: GoalCategory
  goal_id: string
  support_token: string
  owner_token: string
}

export type StoredGoal = Omit<Goal, 'category'> & Pick<GoalInput, 'category'>

type LocalStoredGoal = StoredGoal & { created_at?: number; owner_device_id?: string }

export type SupportGoal = Pick<Goal, 'nickname' | 'title' | 'detail' | 'category'>
export type PublicGoal = Pick<Goal, 'nickname' | 'title' | 'detail' | 'wake_at' | 'support_token' | 'category'> & {
  message_count: number
}

export type OwnerGoal = GoalInput & { category: GoalCategory; is_unlocked?: boolean; message_count?: number }

export interface ProfileGoal {
  goalId?: string
  ownerToken: string
  supportToken: string
  title: string
  category: GoalCategory
  wakeAt: string
  isPublic: boolean
  messageCount: number
}

export function toProfileGoal(saved: StoredGoal, current: OwnerGoal): ProfileGoal {
  return {
    goalId: saved.goal_id,
    ownerToken: saved.owner_token,
    supportToken: saved.support_token,
    title: current.title,
    category: current.category,
    wakeAt: current.wake_at,
    isPublic: current.isPublic ?? false,
    messageCount: current.message_count ?? 0,
  }
}

export interface MessageInput {
  goal_id: string
  sender?: string
  body: string
}

export interface Message extends MessageInput {
  message_id: string
  created_at: string
  status: 'visible' | 'hidden'
}

export type SupportMessageInput = Pick<MessageInput, 'sender' | 'body'>
export type InboxMessage = Pick<Message, 'sender' | 'body' | 'created_at'> & { message_id?: string }

export interface AsayellRepository {
  getProfile(): Promise<Profile | null>
  setProfile(accountName: string): Promise<Profile>
  createGoal(input: CreateGoalInput): Promise<Goal>
  getGoalById(goalId: string): Promise<Goal | null>
  getGoalBySupportToken(token: string): Promise<SupportGoal | null>
  getGoalByOwnerToken(token: string): Promise<OwnerGoal | null>
  listOwnerGoals(): Promise<ProfileGoal[]>
  listPublicGoals(limit?: number): Promise<PublicGoal[]>
  listSurveyResponses(): Promise<SurveyResponseRow[]>
  setPublic(ownerToken: string, isPublic: boolean): Promise<void>
  hideMessage(ownerToken: string, messageId: string): Promise<void>
  postMessage(supportToken: string, input: SupportMessageInput): Promise<void>
  listOwnerMessages(ownerToken: string, demo?: boolean): Promise<InboxMessage[]>
}

export interface SurveyResponseRow {
  goal_id: string
  phase: 'pre' | 'post'
  is_demo: boolean
  q1: number
  q2: number
  q3: number
  continue_intent: number | null
  created_at: string
}

export function toSurveyResponseRow({ goal_id, phase, is_demo, q1, q2, q3, continue_intent, created_at }: SurveyResponseRow): SurveyResponseRow {
  return { goal_id, phase, is_demo, q1, q2, q3, continue_intent, created_at }
}

const surveyResponsePrefix = 'asayell:survey:'

type LocalSurveyResponse = Pick<SurveyResponseRow, 'phase' | 'q1' | 'q2' | 'q3'> & {
  isDemo: boolean
  continueIntent?: number
  createdAt?: string
}

export type RepositoryStorage = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>

const goalPrefix = 'asayell:goal:'

function messagePrefix(goalId: string) {
  return `asayell:message:${goalId}:`
}

function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function getOrCreateDeviceId(storage: RepositoryStorage = window.localStorage) {
  const key = 'asayell:device-id'
  const saved = storage.getItem(key)
  if (saved && /^[0-9a-f]{32}$/.test(saved)) return saved

  const deviceId = createToken()
  storage.setItem(key, deviceId)
  return deviceId
}

export function createGoalTokens() {
  const support_token = createToken()
  let owner_token = createToken()
  while (owner_token === support_token) owner_token = createToken()
  return { support_token, owner_token }
}

export function validateGoal({ nickname, title, detail, wake_at }: CreateGoalInput) {
  if ((nickname !== undefined && (!nickname.trim() || [...nickname].length > accountNameLimit)) ||
      !title.trim() || title.length > 100 ||
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
    for (const [, record] of this.recordEntries<T>(prefix)) yield record
  }

  private *recordEntries<T>(prefix: string): IterableIterator<[string, T]> {
    const storage = this.store
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key?.startsWith(prefix)) continue
      const record = this.read<T>(key)
      if (record !== null) yield [key, record]
    }
  }

  private profileKey(deviceId: string) {
    return 'asayell:profile:' + deviceId
  }

  async getProfile(): Promise<Profile | null> {
    return this.read<Profile>(this.profileKey(getOrCreateDeviceId(this.store)))
  }

  async setProfile(accountName: string): Promise<Profile> {
    const profile = { accountName: normalizeAccountName(accountName) }
    this.store.setItem(this.profileKey(getOrCreateDeviceId(this.store)), JSON.stringify(profile))
    return profile
  }

  async createGoal(input: CreateGoalInput): Promise<Goal> {
    validateGoal(input)
    const { title, detail, wake_at } = input
    const ownerDeviceId = input.nickname === undefined ? getOrCreateDeviceId(this.store) : undefined
    const nickname = ownerDeviceId
      ? this.read<Profile>(this.profileKey(ownerDeviceId))?.accountName
      : input.nickname
    if (nickname === undefined) throw new Error('アカウント名を設定してください。')

    const goal: Goal = {
      nickname, title, detail, wake_at, category: input.category ?? defaultGoalCategory,
      isPublic: input.isPublic ?? false,
      goal_id: crypto.randomUUID(),
      ...createGoalTokens(),
    }
    this.store.setItem(goalPrefix + goal.goal_id, JSON.stringify({ ...goal, created_at: Date.now(), owner_device_id: ownerDeviceId }))
    return goal
  }

  private toGoal({ goal_id, support_token, owner_token, nickname, title, detail, wake_at, category, isPublic }: StoredGoal): Goal {
    return { goal_id, support_token, owner_token, nickname, title, detail, wake_at, category: category ?? defaultGoalCategory, isPublic }
  }

  async getGoalById(goalId: string): Promise<Goal | null> {
    const goal = this.read<StoredGoal>(goalPrefix + goalId)
    return goal && this.toGoal(goal)
  }

  async getGoalBySupportToken(token: string): Promise<(SupportGoal & Pick<Goal, 'goal_id'>) | null> {
    for (const goal of this.records<StoredGoal>(goalPrefix)) {
      if (goal.support_token === token) {
        const { goal_id, nickname, title, detail } = goal
        return { goal_id, nickname, title, detail, category: goal.category ?? defaultGoalCategory }
      }
    }
    return null
  }

  private findStoredGoalByOwnerToken(token: string): LocalStoredGoal | null {
    for (const goal of this.records<LocalStoredGoal>(goalPrefix)) {
      if (goal.owner_token === token) return goal
    }
    return null
  }

  async getGoalByOwnerToken(token: string): Promise<Goal | null> {
    const goal = this.findStoredGoalByOwnerToken(token)
    return goal && { ...this.toGoal(goal), isPublic: goal.isPublic ?? false }
  }

  async listOwnerGoals(): Promise<ProfileGoal[]> {
    return Promise.all([...this.records<StoredGoal>(goalPrefix)].map(async (goal) => {
      const messages = await this.listMessages(goal.goal_id)
      return toProfileGoal(goal, { ...goal, category: goal.category ?? defaultGoalCategory, message_count: messages.length })
    }))
  }

  async listPublicGoals(limit = 20): Promise<PublicGoal[]> {
    const now = Date.now()
    const goals = [...this.records<LocalStoredGoal>(goalPrefix)]
      .filter((goal) => goal.isPublic === true && Date.parse(goal.wake_at) > now)
      // Prefer later storage entries for legacy records and equal timestamps.
      .reverse()
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))

    const count = Math.min(Math.max(Math.trunc(limit), 1), 50)
    return Promise.all(goals.slice(0, count).map(async (goal) => {
      const { nickname, title, detail, wake_at, support_token } = goal
      const messages = await this.listMessages(goal.goal_id)
      return {
        nickname, title, detail, wake_at, support_token,
        category: goal.category ?? defaultGoalCategory, message_count: messages.length,
      }
    }))
  }

  async setPublic(ownerToken: string, isPublic: boolean): Promise<void> {
    const goal = this.findStoredGoalByOwnerToken(ownerToken)
    if (!goal) throw new Error('目標が見つかりません。')
    this.store.setItem(goalPrefix + goal.goal_id, JSON.stringify({ ...goal, category: goal.category ?? defaultGoalCategory, isPublic }))
  }

  async hideMessage(ownerToken: string, messageId: string): Promise<void> {
    const goal = await this.getGoalByOwnerToken(ownerToken)
    if (!goal) throw new Error('目標が見つかりません。')
    const key = messagePrefix(goal.goal_id) + messageId
    const message = this.read<Message>(key)
    if (!message) throw new Error('エールが見つかりません。')
    this.store.setItem(key, JSON.stringify({ ...message, status: 'hidden' }))
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

  async listSurveyResponses(): Promise<SurveyResponseRow[]> {
    return [...this.recordEntries<LocalSurveyResponse>(surveyResponsePrefix)]
      .map(([key, { phase, isDemo, q1, q2, q3, continueIntent, createdAt }]) => ({
        goal_id: key.slice(surveyResponsePrefix.length, key.lastIndexOf(':')),
        phase, is_demo: isDemo, q1, q2, q3,
        continue_intent: phase === 'post' ? continueIntent ?? null : null,
        // The initial local survey format does not record a submission time.
        created_at: createdAt ?? '',
      }))
      .sort((first, second) => first.created_at.localeCompare(second.created_at))
  }

  async listMessages(goalId: string): Promise<Message[]> {
    return [...this.records<Message>(messagePrefix(goalId))]
      .filter((message) => message.status === 'visible')
      .sort((first, second) => first.created_at.localeCompare(second.created_at))
  }
}
