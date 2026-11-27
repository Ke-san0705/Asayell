import { useEffect, useState } from 'react'
import type { AsayellRepository, Goal } from './repository'
import { routePath } from './routes'

export function GoalShare({ repository, goalId }: { repository: AsayellRepository; goalId: string }) {
  const [goal, setGoal] = useState<Goal | null>(null)
  const [loadMessage, setLoadMessage] = useState('')
  const [copyMessage, setCopyMessage] = useState('')

  useEffect(() => {
    let active = true
    void repository.getGoalById(goalId).then((storedGoal) => {
      if (!active) return
      if (storedGoal) setGoal(storedGoal)
      else setLoadMessage('このブラウザでは目標が見つかりませんでした。登録したブラウザで開いてみてください。')
    }).catch(() => {
      if (active) setLoadMessage('今は目標を開けませんでした。少し時間をおいて、ページを開き直してみてください。')
    })
    return () => { active = false }
  }, [repository, goalId])

  if (loadMessage) return <p role="alert">{loadMessage}</p>
  if (!goal) return <p role="status">目標を読み込んでいます…</p>

  const supportUrl = new URL(routePath('s', goal.support_token), window.location.origin).href
  const ownerUrl = new URL(routePath('o', goal.owner_token), window.location.origin).href

  async function copySupportUrl() {
    try {
      await navigator.clipboard.writeText(supportUrl)
      setCopyMessage('応援募集URLをコピーしました。')
    } catch {
      setCopyMessage('自動でコピーできませんでした。上に表示されているURLを選んでコピーできます。')
    }
  }

  return (
    <>
      <p className="intro">目標を登録しました。応援してほしい人に、応援募集URLを渡せます。</p>
      <div className="share-options">
        <section className="share-option">
          <h2>応援募集URL</h2>
          <p>応援してほしい人に、このURLを送ってください。</p>
          <p className="share-url">{supportUrl}</p>
          <button className="action" type="button" onClick={copySupportUrl}>応援募集URLをコピー</button>
          <div className="feedback" role="status">{copyMessage}</div>
        </section>
        <section className="share-option">
          <h2>本人専用の受信URL</h2>
          <p id="owner-url-note">エールを読むための、ご本人だけのURLです。朝に開けるよう、ご自身のために保管しておいてください。</p>
          <p className="share-url">{ownerUrl}</p>
          <a className="action secondary" href={ownerUrl} aria-describedby="owner-url-note">
            本人専用の受信URLを開く
          </a>
        </section>
      </div>
    </>
  )
}
