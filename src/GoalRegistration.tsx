import { useRef, useState, type FormEvent } from 'react'
import { goalLimits, isValidRegistration, nextWakeAt } from './registrationFields'
import { defaultGoalCategory, goalCategoryLabels, type AsayellRepository, type GoalCategory } from './repository'
import { routePath } from './routes'

export function GoalRegistration({ repository }: { repository: AsayellRepository }) {
  const [fields, setFields] = useState({ nickname: '', title: '', time: '' })
  const [category, setCategory] = useState<GoalCategory>(defaultGoalCategory)
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  const valid = isValidRegistration(fields)

  function update(field: keyof typeof fields, value: string) {
    setFields((current) => ({ ...current, [field]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || submitting.current) return

    submitting.current = true
    setSaving(true)
    setError('')
    try {
      const goal = await repository.createGoal({
        nickname: fields.nickname.trim(),
        title: fields.title.trim(),
        wake_at: nextWakeAt(fields.time),
        category,
        isPublic,
      })
      window.location.assign(routePath('share', goal.goal_id))
    } catch {
      submitting.current = false
      setSaving(false)
      setError('今は目標を登録できませんでした。入力した内容はそのままです。もう一度お試しください。')
    }
  }

  return (
    <>
      <p className="intro">明日の朝が少し楽しみになることを、ひとつ書いてみませんか。</p>
      <form className="goal-form" onSubmit={submit} aria-busy={saving}>
        <label>
          ニックネーム <span className="hint">（{goalLimits.nickname}文字まで）</span>
          <input name="nickname" required maxLength={goalLimits.nickname}
            value={fields.nickname} onChange={(event) => update('nickname', event.target.value)} />
        </label>
        <fieldset className="category-field" disabled={saving}>
          <legend>種類</legend>
          <div className="category-options">
            {(Object.keys(goalCategoryLabels) as GoalCategory[]).map((option) => (
              <label key={option}>
                <input type="radio" name="category" value={option} checked={category === option}
                  onChange={() => setCategory(option)} />
                <span>{goalCategoryLabels[option]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          夢・目標・楽しみ <span className="hint">（{goalLimits.title}文字まで）</span>
          <input name="title" required maxLength={goalLimits.title}
            value={fields.title} onChange={(event) => update('title', event.target.value)} />
        </label>
        <label>
          起床予定時刻 <span className="hint">（日本時間）</span>
          <input name="wakeTime" type="time" required
            value={fields.time} onChange={(event) => update('time', event.target.value)} />
        </label>
        <label className="visibility-option">
          <input name="isPublic" type="checkbox" checked={isPublic} disabled={saving}
            aria-describedby="public-goal-description"
            onChange={(event) => setIsPublic(event.target.checked)} />
          みんなに公開する
        </label>
        <p className="visibility-description" id="public-goal-description">
          起床予定時刻まで、ニックネーム・目標タイトル・起床予定が公開されます。
          エールの本文と本人専用リンクは公開されません。
        </p>
        {error && <p className="feedback" role="alert">{error}</p>}
        <button className="action" type="submit" disabled={!valid || saving}>
          {saving ? '登録中…' : '目標を登録する'}
        </button>
      </form>
    </>
  )
}
