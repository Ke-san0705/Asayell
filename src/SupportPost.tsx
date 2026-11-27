import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { AsayellRepository, SupportGoal } from './repository'

interface SupportPostProps {
  repository: AsayellRepository
  supportToken: string
}

const messageLimit = 150

export function SupportPost({ repository, supportToken }: SupportPostProps) {
  const [goal, setGoal] = useState<SupportGoal | null>()
  const [loadFailed, setLoadFailed] = useState(false)
  const [sender, setSender] = useState('')
  const [body, setBody] = useState('')
  const [postStatus, setPostStatus] = useState<'idle' | 'pending' | 'sent' | 'failed'>('idle')
  const submissionStarted = useRef(false)

  useEffect(() => {
    let active = true
    void repository.getGoalBySupportToken(supportToken).then(
      (result) => { if (active) setGoal(result) },
      () => { if (active) setLoadFailed(true) },
    )
    return () => { active = false }
  }, [repository, supportToken])

  const tooLong = body.length > messageLimit
  const canSubmit = Boolean(body.trim()) && !tooLong
  const pending = postStatus === 'pending'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!goal || !canSubmit || submissionStarted.current) return

    submissionStarted.current = true
    setPostStatus('pending')
    try {
      await repository.createMessage({
        goal_id: goal.goal_id,
        sender: sender.trim() || undefined,
        body,
      })
      setPostStatus('sent')
    } catch {
      submissionStarted.current = false
      setPostStatus('failed')
    }
  }

  if (loadFailed) {
    return <p role="alert">目標を読み込めませんでした。ページを開き直してみてください。</p>
  }
  if (goal === undefined) return <p role="status">目標を読み込んでいます…</p>
  if (goal === null) {
    return <p role="status">リンクが正しくないかもしれません。送ってくれた方に確認してみてください。</p>
  }

  return (
    <>
      <section className="support-goal" aria-labelledby="support-goal-title">
        <p>{goal.nickname}さんの目標</p>
        <h2 id="support-goal-title">{goal.title}</h2>
        {goal.detail && <p>{goal.detail}</p>}
      </section>
      {postStatus === 'sent' ? (
        <p className="support-confirmation" role="status">
          エールを送りました。翌朝に届きます。
        </p>
      ) : (
        <form className="support-form" onSubmit={submit}>
          <div>
            <label htmlFor="support-sender">応援者名 <span>（任意）</span></label>
            <input
              id="support-sender"
              name="sender"
              value={sender}
              onChange={(event) => setSender(event.target.value)}
              disabled={pending}
            />
          </div>
          <div>
            <label htmlFor="support-body">メッセージ本文</label>
            <textarea
              id="support-body"
              name="body"
              rows={4}
              required
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={pending}
              aria-describedby="support-length"
              aria-invalid={tooLong}
            />
            <p id="support-length" className="support-length">
              {tooLong && <span role="alert">150文字以内で入力してください。</span>}
              <span>{body.length} / {messageLimit}文字</span>
            </p>
          </div>
          {postStatus === 'failed' && (
            <p className="support-error" role="alert">
              エールを送れませんでした。もう一度お試しください。
            </p>
          )}
          <button type="submit" disabled={!canSubmit || pending}>
            {pending ? '送信中…' : 'エールを投稿する'}
          </button>
        </form>
      )}
    </>
  )
}
