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
      else setLoadMessage('目標が見つかりませんでした。登録したブラウザで開いてください。')
    }).catch(() => {
      if (active) setLoadMessage('目標を読み込めませんでした。ページを再読み込みしてください。')
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
      setCopyMessage('自動でコピーできませんでした。表示されている応援募集URLを選択してコピーしてください。')
    }
  }

  return (
    <>
      <p className="intro">目標を登録しました。応援募集URLを届けて、エールを集めましょう。</p>
      <div className="share-options">
        <section className="share-option">
          <h2>応援募集URL</h2>
          <p>この試作版では、登録したブラウザで応援画面を開けます。</p>
          <p className="share-url">{supportUrl}</p>
          <button className="action" type="button" onClick={copySupportUrl}>応援募集URLをコピー</button>
          <div className="feedback" role="status">{copyMessage}</div>
        </section>
        <section className="share-option">
          <h2>本人専用の受信URL</h2>
          <p id="owner-url-note">受信URLはご本人専用です。第三者には共有せず、ご自身で保管してください。</p>
          <p className="share-url">{ownerUrl}</p>
          <a className="action secondary" href={ownerUrl} aria-describedby="owner-url-note">
            本人専用の受信URLを開く
          </a>
        </section>
      </div>
    </>
  )
}
