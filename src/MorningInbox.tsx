import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { InboxSurvey, skipPreSurveyLabel } from './InboxSurvey'
import type { AsayellRepository, InboxMessage, SurveyPhase, SurveyResponse } from './repository'

type InboxState =
  | { kind: 'loading' | 'missing' | 'error' }
  | { kind: 'waiting'; nickname: string }
  | { kind: 'ready'; nickname: string; messages: InboxMessage[] }

// Browsers store timeout delays as signed 32-bit integers.
const maxTimeout = 2_147_483_647

interface MorningInboxProps {
  ownerToken: string
  repository: AsayellRepository
}

export function MorningInbox({ ownerToken, repository }: MorningInboxProps) {
  const [inbox, setInbox] = useState<InboxState>({ kind: 'loading' })
  const [isPublic, setIsPublic] = useState<boolean>()
  const visibilityRevision = useRef(0)
  const [savingVisibility, setSavingVisibility] = useState(false)
  const [visibilityError, setVisibilityError] = useState(false)
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set())
  const [hiding, setHiding] = useState(false)
  const [demo, setDemo] = useState<{ nickname: string } | null>(null)
  const demoButton = useRef<HTMLButtonElement>(null)
  const returningFromDemo = useRef(false)
  const pendingSurveys = useRef(new Set<Promise<void>>())

  useEffect(() => {
    if (!demo && returningFromDemo.current) {
      demoButton.current?.focus()
      returningFromDemo.current = false
    }
  }, [demo])

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined

    function showError() {
      if (active) setInbox({ kind: 'error' })
    }

    async function loadInbox() {
      const revision = visibilityRevision.current
      const goal = await repository.getGoalByOwnerToken(ownerToken)
      if (!active) return
      if (!goal) {
        setInbox({ kind: 'missing' })
        return
      }

      const { nickname, is_unlocked } = goal
      const wakeAt = Date.parse(goal.wake_at)
      if (!Number.isFinite(wakeAt)) {
        showError()
        return
      }

      if (revision === visibilityRevision.current) setIsPublic(goal.isPublic)

      function checkWakeTime() {
        const remaining = wakeAt - Date.now()
        if (is_unlocked === false || (is_unlocked === undefined && remaining > 0)) {
          setInbox({ kind: 'waiting', nickname })
          const delay = Math.min(is_unlocked === false ? Math.max(remaining, 1000) : remaining, maxTimeout)
          timer = setTimeout(() => {
            if (is_unlocked === false) void loadInbox().catch(showError)
            else checkWakeTime()
          }, delay)
          return
        }

        void repository.listOwnerMessages(ownerToken).then((messages) => {
          if (active) setInbox({ kind: 'ready', nickname, messages })
        }).catch(showError)
      }

      checkWakeTime()
    }

    void loadInbox().catch(showError)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [ownerToken, repository])

  async function changeVisibility(value: boolean) {
    setSavingVisibility(true)
    setVisibilityError(false)
    try {
      await repository.setPublic(ownerToken, value)
      visibilityRevision.current += 1
      setIsPublic(value)
    } catch {
      setVisibilityError(true)
    } finally {
      setSavingVisibility(false)
    }
  }

  async function hideMessage(messageId: string) {
    setHiding(true)
    try {
      await repository.hideMessage(ownerToken, messageId)
      setHiddenIds((current) => new Set(current).add(messageId))
    } finally {
      setHiding(false)
    }
  }

  if (demo) {
    return (
      <InboxDemo ownerToken={ownerToken} nickname={demo.nickname} repository={repository} pendingSurveys={pendingSurveys}
        hiddenIds={hiddenIds} hiding={hiding} onHide={hideMessage} onExit={() => {
        returningFromDemo.current = true
        setDemo(null)
      }} />
    )
  }

  return (
    <div className="morning-inbox" aria-live="polite">
      {inbox.kind === 'loading' && <p>受信リンクを確認しています。</p>}
      {inbox.kind === 'missing' && (
        <p>受信リンクが見つかりませんでした。目標を登録したときの本人専用リンクを、もう一度開いてみてください。</p>
      )}
      {inbox.kind === 'error' && (
        <p>今はエールを開けませんでした。少し時間をおいて、もう一度このページを開いてみてください。</p>
      )}
      {inbox.kind === 'ready' && (
        <p className="morning-greeting">{inbox.nickname}さん、おはようございます。</p>
      )}
      {inbox.kind === 'waiting' && (
        <>
          <p className="morning-greeting">{inbox.nickname}さんへ</p>
          <p className="inbox-note">明日の朝にエールが届きます。起床予定時刻になったら、ここで読めます。</p>
          <button className="action secondary inbox-action" type="button" ref={demoButton}
            onClick={() => setDemo({ nickname: inbox.nickname })}>
            デモ：翌朝を体験する
          </button>
        </>
      )}
      {inbox.kind === 'ready' && (
        <InboxReading ownerToken={ownerToken} repository={repository} pendingSurveys={pendingSurveys} isDemo={false}
          messages={inbox.messages} hiddenIds={hiddenIds} hiding={hiding} onHide={hideMessage} />
      )}
      {(inbox.kind === 'waiting' || inbox.kind === 'ready') && isPublic !== undefined && (
        <div className="inbox-visibility">
          <label className="visibility-option">
            <input type="checkbox" checked={isPublic} disabled={savingVisibility}
              onChange={(event) => void changeVisibility(event.target.checked)} />
            みんなに公開する
          </label>
          {visibilityError && <p className="feedback" role="alert">公開設定を変更できませんでした。もう一度お試しください。</p>}
        </div>
      )}
    </div>
  )
}

interface MessageActions {
  hiddenIds: ReadonlySet<string>
  hiding: boolean
  onHide: (messageId: string) => Promise<void>
}

type PendingSurveys = RefObject<Set<Promise<void>>>

function InboxDemo({ ownerToken, nickname, repository, pendingSurveys, onExit, hiddenIds, hiding, onHide }: MessageActions & MorningInboxProps & {
  nickname: string
  pendingSurveys: PendingSurveys
  onExit: () => void
}) {
  const [preview, setPreview] = useState<
    { kind: 'loading' | 'error' } | { kind: 'ready'; messages: InboxMessage[] }
  >({ kind: 'loading' })
  const notice = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    notice.current?.focus()
    let active = true

    async function loadPreview() {
      try {
        const messages = await repository.listOwnerMessages(ownerToken, true)
        if (active) setPreview({ kind: 'ready', messages })
      } catch {
        if (active) setPreview({ kind: 'error' })
      }
    }

    void loadPreview()
    return () => { active = false }
  }, [ownerToken, repository])

  return (
    <div className="morning-inbox">
      <p className="demo-notice" ref={notice} tabIndex={-1}>デモモードで表示しています</p>
      <div aria-live="polite">
        <p className="morning-greeting">{nickname}さん、おはようございます。</p>
        {preview.kind === 'loading' && <p>エールを確認しています。</p>}
        {preview.kind === 'error' && (
          <p>今はエールを開けませんでした。デモを終了してから、もう一度お試しください。</p>
        )}
        {preview.kind === 'ready' && <InboxReading ownerToken={ownerToken} repository={repository} pendingSurveys={pendingSurveys} isDemo
          messages={preview.messages} hiddenIds={hiddenIds} hiding={hiding} onHide={onHide} />}
      </div>
      <button className="action secondary inbox-action" type="button" disabled={hiding} onClick={onExit}>
        デモを終了する
      </button>
    </div>
  )
}

function InboxReading({ ownerToken, repository, pendingSurveys, isDemo, ...reader }: MorningInboxProps & MessageActions & {
  isDemo: boolean
  pendingSurveys: PendingSurveys
  messages: InboxMessage[]
}) {
  const [status, setStatus] = useState<SurveyPhase[] | null>()
  const [dismissedPre, setDismissedPre] = useState(false)
  const [dismissedPost, setDismissedPost] = useState(false)

  useEffect(() => {
    let active = true
    async function loadStatus() {
      // The owner can exit a demo while a response is still being saved.
      if (pendingSurveys.current.size) await Promise.allSettled(pendingSurveys.current)
      if (!active) return
      try {
        const phases = await repository.getSurveyStatus(ownerToken)
        if (active) setStatus(phases)
      } catch {
        // Keep the inbox available when the survey RPC is unavailable.
        if (active) setStatus(null)
      }
    }
    void loadStatus()
    return () => { active = false }
  }, [ownerToken, pendingSurveys, repository])

  async function save(response: SurveyResponse) {
    const request = repository.saveSurveyResponse(ownerToken, response)
    const pending = pendingSurveys.current
    pending.add(request)
    try {
      await request
    } finally {
      pending.delete(request)
    }
  }

  if (!dismissedPre && status === undefined) {
    return (
      <button className="action secondary inbox-action" type="button" onClick={() => setDismissedPre(true)}>
        {skipPreSurveyLabel}
      </button>
    )
  }
  if (!dismissedPre && status && !status.includes('pre')) {
    return <InboxSurvey phase="pre" isDemo={isDemo} onSave={save} onDone={() => setDismissedPre(true)} />
  }

  return <MessageReader {...reader} afterReading={
    !dismissedPost && status && !status.includes('post') &&
    <InboxSurvey phase="post" isDemo={isDemo} onSave={save} onDone={() => setDismissedPost(true)} />
  } />
}

function MessageReader({ messages, hiddenIds, hiding, onHide, afterReading }: MessageActions & {
  messages: InboxMessage[]
  afterReading: ReactNode
}) {
  const [position, setPosition] = useState(0)
  const [hideError, setHideError] = useState(false)
  const isVisible = ({ message_id }: InboxMessage) => !message_id || !hiddenIds.has(message_id)
  const visibleMessages = messages.filter(isVisible)
  // Keep the reading position stable when the current message is hidden.
  const index = messages.slice(0, position)
    .filter(isVisible).length
  const closing = useRef<HTMLParagraphElement>(null)
  const message = visibleMessages[index]
  const messageId = message?.message_id

  async function hideCurrentMessage(messageId: string) {
    setHideError(false)
    try {
      await onHide(messageId)
    } catch {
      setHideError(true)
    }
  }

  useEffect(() => {
    if (index > 0 && index === visibleMessages.length) closing.current?.focus()
  }, [index, visibleMessages.length])

  return (
    <>
      <p>届いたエール <strong>{visibleMessages.length}件</strong></p>
      {visibleMessages.length === 0 ? (
        <p className="inbox-note">今日も自分のペースで。</p>
      ) : message ? (
        <>
          <figure className="inbox-message">
            <figcaption>{index + 1}通目 / {visibleMessages.length}通</figcaption>
            <blockquote>{message.body}</blockquote>
            {message.sender?.trim() && <p>{message.sender}さんより</p>}
          </figure>
          <button className="action inbox-action" type="button" disabled={hiding} onClick={() => {
            setHideError(false)
            setPosition(messages.indexOf(message) + 1)
          }}>
            次へ
          </button>
          {messageId && (
            <button className="action secondary inbox-action" type="button" disabled={hiding}
              onClick={() => void hideCurrentMessage(messageId)}>
              隠す
            </button>
          )}
          {hideError && <p className="feedback" role="alert">エールを隠せませんでした。もう一度お試しください。</p>}
        </>
      ) : (
        <>
          <p className="inbox-note" ref={closing} tabIndex={-1}>
            すべてのエールを読み終えました。今日も、あなたのペースで。
          </p>
          {afterReading}
        </>
      )}
    </>
  )
}
