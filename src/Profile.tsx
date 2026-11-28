import { useEffect, useState, type FormEvent } from 'react'
import { accountNameLimit, goalCategoryLabels, normalizeAccountName, type AsayellRepository, type ProfileGoal } from './repository'
import { routePath } from './routes'

const wakeDate = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short',
})

type ProfileState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; goals: ProfileGoal[] }

function ProfileCard({ goal, repository }: { goal: ProfileGoal; repository: AsayellRepository }) {
  const [isPublic, setIsPublic] = useState(goal.isPublic)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const supportUrl = new URL(routePath('s', goal.supportToken), window.location.origin).href

  async function updateVisibility(next: boolean) {
    setSaving(true)
    setError('')
    try {
      await repository.setPublic(goal.ownerToken, next)
      setIsPublic(next)
    } catch {
      setError('公開設定を変更できませんでした。もう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  async function copySupportUrl() {
    try {
      await navigator.clipboard.writeText(supportUrl)
      setCopyStatus('応援募集URLをコピーしました。')
    } catch {
      setCopyStatus('応援募集URLをコピーできませんでした。もう一度お試しください。')
    }
  }

  return (
    <article className="share-option profile-goal">
      <span className="category-badge">{goalCategoryLabels[goal.category]}</span>
      <h2>{goal.title}</h2>
      <p>起床予定 <time dateTime={goal.wakeAt}>{wakeDate.format(new Date(goal.wakeAt))}</time></p>
      <p>届いた応援 {goal.messageCount}件</p>
      <label>
        <input
          type="checkbox"
          checked={isPublic}
          disabled={saving}
          onChange={(event) => void updateVisibility(event.currentTarget.checked)}
        />
        みんなの夢に公開
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="action secondary" type="button" onClick={copySupportUrl}>応援募集URLをコピー</button>
      {copyStatus && <p role="status">{copyStatus}</p>}
      <button className="action" type="button" onClick={() => window.location.assign(routePath('o', goal.ownerToken))}>
        受信画面を開く
      </button>
    </article>
  )
}

function AccountNameForm({ repository }: { repository: AsayellRepository }) {
  const [name, setName] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    let active = true
    void repository.getProfile().then((profile) => {
      if (!active) return
      setName(profile?.accountName ?? '')
      setLoaded(true)
    }).catch(() => {
      if (active) setError('アカウント名を読み込めませんでした。もう一度ページを開いてください。')
    })
    return () => { active = false }
  }, [repository])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!loaded || saving) return
    setError('')
    setStatus('')
    setSaving(true)
    try {
      const profile = await repository.setProfile(normalizeAccountName(name))
      setName(profile.accountName)
      setStatus('アカウント名を保存しました。')
    } catch (cause) {
      setError(cause instanceof RangeError
        ? cause.message
        : 'アカウント名を保存できませんでした。もう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="goal-form account-name-form" onSubmit={save} aria-busy={(!loaded && !error) || saving}>
      <label>
        アカウント名 <span className="hint">（{accountNameLimit}文字まで）</span>
        <input name="accountName" value={name} required disabled={!loaded || saving}
          onChange={(event) => { setName(event.target.value); setStatus(''); setError('') }} />
      </label>
      {error && <p className="feedback" role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      <button className="action" type="submit" disabled={!loaded || saving}>
        {saving ? '保存中…' : 'アカウント名を保存する'}
      </button>
    </form>
  )
}

export function Profile({ repository }: { repository: AsayellRepository }) {
  return (
    <>
      <AccountNameForm repository={repository} />
      <ProfileGoals repository={repository} />
    </>
  )
}

function ProfileGoals({ repository }: { repository: AsayellRepository }) {
  const [profile, setProfile] = useState<ProfileState>({ kind: 'loading' })

  useEffect(() => {
    let requestId = 0

    function loadGoals() {
      const id = ++requestId
      setProfile({ kind: 'loading' })
      void repository.listOwnerGoals().then((goals) => {
        if (requestId === id) setProfile({ kind: 'ready', goals })
      }).catch(() => {
        if (requestId === id) setProfile({ kind: 'error' })
      })
    }

    function restore(event: PageTransitionEvent) {
      if (event.persisted) loadGoals()
    }

    loadGoals()
    window.addEventListener('pageshow', restore)
    return () => {
      requestId += 1
      window.removeEventListener('pageshow', restore)
    }
  }, [repository])

  if (profile.kind === 'loading') return <p role="status">自分の夢を読み込んでいます。</p>
  if (profile.kind === 'error') return <p role="alert">夢を読み込めませんでした。時間をおいてもう一度開いてください。</p>
  if (profile.goals.length === 0) return (
    <>
      <p>このブラウザには登録した夢の控えがありません。</p>
      <p>以前登録した夢のエールは、登録時に保存した本人専用の受信URLから確認できます。</p>
    </>
  )

  return (
    <div className="share-options">
      {profile.goals.map((goal) => <ProfileCard key={goal.ownerToken} goal={goal} repository={repository} />)}
    </div>
  )
}
