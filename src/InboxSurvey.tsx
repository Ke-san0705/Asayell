import { useState, type FormEvent } from 'react'
import type { SurveyPhase, SurveyResponse } from './repository'

const questions = [
  '今日を迎えることが楽しみだ。',
  '自分を応援してくれる人がいると感じる。',
  '自分の未来を前向きに考えられる。',
]
const postQuestions = [...questions, 'これからもアサエールを使いたい。']
const scale = [1, 2, 3, 4, 5]

export const skipPreSurveyLabel = '回答せずにエールを読む'

interface InboxSurveyProps {
  phase: SurveyPhase
  isDemo: boolean
  onSave: (response: SurveyResponse) => Promise<void>
  onDone: () => void
}

export function InboxSurvey({ phase, isDemo, onSave, onDone }: InboxSurveyProps) {
  const [consent, setConsent] = useState(false)
  const [scores, setScores] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const items = phase === 'pre' ? questions : postQuestions
  const canSubmit = consent && items.every((_, index) => scores[index] !== undefined)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit || saving) return
    setSaving(true)
    setSaveError(false)
    const response = { isDemo, q1: scores[0], q2: scores[1], q3: scores[2], consent }
    try {
      await onSave(phase === 'pre' ? { ...response, phase } : { ...response, phase, continueIntent: scores[3] })
      onDone()
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="inbox-note inbox-survey" onSubmit={(event) => void submit(event)}>
      <h2>{phase === 'pre' ? '受信前アンケート' : '受信後アンケート'}</h2>
      <p>エールを受け取る前後で、朝の気持ちがどう変わるかを確かめるために回答を使います。参加は任意です。</p>
      <label className="visibility-option">
        <input type="checkbox" checked={consent} disabled={saving}
          onChange={(event) => setConsent(event.target.checked)} />
        検証への参加と回答の保存に同意する
      </label>
      <button className="action secondary inbox-action" type="button" onClick={onDone}>
        {phase === 'pre' ? skipPreSurveyLabel : '回答せずに終了する'}
      </button>
      <p>1＝まったくそう思わない ／ 5＝とてもそう思う</p>
      {items.map((question, index) => (
        <fieldset className="category-field" key={question} disabled={saving}>
          <legend>{question}</legend>
          <div className="survey-scale">
            {scale.map((score) => (
              <label key={score}>
                <input type="radio" name={'survey-' + index} value={score}
                  checked={scores[index] === score}
                  onChange={() => setScores((current) => ({ ...current, [index]: score }))} />
                {score}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <button className="action inbox-action" type="submit" disabled={!canSubmit || saving}>
        {saving ? '保存中…' : '回答を保存する'}
      </button>
      {saveError && <p className="feedback" role="alert">回答を保存できませんでした。もう一度お試しください。</p>}
    </form>
  )
}
