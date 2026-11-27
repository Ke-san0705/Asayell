import { useEffect, useRef, useState } from 'react'
import type { AsayellRepository, Message } from './repository'

type InboxState =
  | { kind: 'loading' | 'missing' | 'error' }
  | { kind: 'waiting'; nickname: string }
  | { kind: 'ready'; nickname: string; messages: Message[] }

// Browsers store timeout delays as signed 32-bit integers.
const maxTimeout = 2_147_483_647

interface MorningInboxProps {
  ownerToken: string
  repository: AsayellRepository
}

export function MorningInbox({ ownerToken, repository }: MorningInboxProps) {
  const [inbox, setInbox] = useState<InboxState>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined

    function showError() {
      if (active) setInbox({ kind: 'error' })
    }

    async function loadInbox() {
      const goal = await repository.getGoalByOwnerToken(ownerToken)
      if (!active) return
      if (!goal) {
        setInbox({ kind: 'missing' })
        return
      }

      const { goal_id, nickname } = goal
      const wakeAt = Date.parse(goal.wake_at)
      if (!Number.isFinite(wakeAt)) {
        showError()
        return
      }

      function checkWakeTime() {
        const remaining = wakeAt - Date.now()
        if (remaining > 0) {
          setInbox({ kind: 'waiting', nickname })
          timer = setTimeout(checkWakeTime, Math.min(remaining, maxTimeout))
          return
        }

        void repository.listMessages(goal_id).then((messages) => {
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

  return (
    <div className="morning-inbox" aria-live="polite">
      {inbox.kind === 'loading' && <p>受信リンクを確認しています。</p>}
      {inbox.kind === 'missing' && (
        <p>受信リンクが見つかりませんでした。目標を登録したときの本人専用リンクを、もう一度開いてみてください。</p>
      )}
      {inbox.kind === 'error' && (
        <p>今はエールを開けませんでした。少し時間をおいて、もう一度このページを開いてみてください。</p>
      )}
      {(inbox.kind === 'waiting' || inbox.kind === 'ready') && (
        <p className="morning-greeting">{inbox.nickname}さん、おはようございます。</p>
      )}
      {inbox.kind === 'waiting' && <p className="inbox-note">明日の朝にエールが届きます</p>}
      {inbox.kind === 'ready' && <MessageReader messages={inbox.messages} />}
    </div>
  )
}

function MessageReader({ messages }: { messages: Message[] }) {
  const [index, setIndex] = useState(0)
  const closing = useRef<HTMLParagraphElement>(null)
  const message = messages[index]

  useEffect(() => {
    if (index > 0 && index === messages.length) closing.current?.focus()
  }, [index, messages.length])

  return (
    <>
      <p>届いたエール <strong>{messages.length}件</strong></p>
      {messages.length === 0 ? (
        <p className="inbox-note">今日も自分のペースで。</p>
      ) : message ? (
        <>
          <figure className="inbox-message">
            <figcaption>{index + 1}通目 / {messages.length}通</figcaption>
            <blockquote>{message.body}</blockquote>
            {message.sender?.trim() && <p>{message.sender}さんより</p>}
          </figure>
          <button className="inbox-next" type="button" onClick={() => setIndex(index + 1)}>
            次へ
          </button>
        </>
      ) : (
        <p className="inbox-note" ref={closing} tabIndex={-1}>
          すべてのエールを読み終えました。今日も、あなたのペースで。
        </p>
      )}
    </>
  )
}
