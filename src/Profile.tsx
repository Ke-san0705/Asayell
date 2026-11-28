import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useBlocker, useNavigate } from 'react-router'
import { accountNameLimit, goalCategoryLabels, normalizeAccountName, type AsayellRepository, type ProfileGoal } from './repository'
import { routePath } from './routes'

const wakeDate = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short',
})

type ProfileState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; goals: ProfileGoal[] }

function ProfileCard({ goal, repository }: { goal: ProfileGoal; repository: AsayellRepository }) {
  const navigate = useNavigate()
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
      <button className="action" type="button" onClick={() => void navigate(routePath('o', goal.ownerToken))}>
        受信画面を開く
      </button>
    </article>
  )
}

function AccountNameForm({ repository }: { repository: AsayellRepository }) {
  const [name, setName] = useState('')
  const [savedName, setSavedName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const loaded = savedName !== null
  const dirty = loaded && name !== savedName
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirty && (currentLocation.pathname !== nextLocation.pathname ||
      currentLocation.search !== nextLocation.search ||
      currentLocation.hash !== nextLocation.hash),
  )
  const blocked = blocker.state === 'blocked'

  useEffect(() => {
    if (!blocked) return
    const dialog = dialogRef.current!
    dialog.showModal()
    cancelRef.current?.focus()
    return () => dialog.close()
  }, [blocked])

  useEffect(() => {
    let active = true
    void repository.getProfile().then((profile) => {
      if (!active) return
      const accountName = profile?.accountName ?? ''
      setName(accountName)
      setSavedName(accountName)
    }).catch(() => {
      if (active) setError('アカウント名を読み込めませんでした。もう一度ページを開いてください。')
    })
    return () => { active = false }
  }, [repository])

  async function saveName() {
    if (!loaded || saving) return false
    setError('')
    setStatus('')
    setSaving(true)
    try {
      const profile = await repository.setProfile(normalizeAccountName(name))
      setName(profile.accountName)
      setSavedName(profile.accountName)
      setStatus('アカウント名を保存しました。')
      return true
    } catch (cause) {
      setError(cause instanceof RangeError
        ? cause.message
        : 'アカウント名を保存できませんでした。もう一度お試しください。')
      return false
    } finally {
      setSaving(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void saveName()
  }

  async function saveAndProceed() {
    if (blocker.state === 'blocked' && (!dirty || await saveName())) blocker.proceed()
  }

  function discardAndProceed() {
    if (blocker.state !== 'blocked') return
    setName(savedName ?? '')
    setError('')
    blocker.proceed()
  }

  return (
    <>
      <form className="goal-form account-name-form" onSubmit={submit} aria-busy={(!loaded && !error) || saving}>
        <label>
          アカウント名 <span className="hint">（{accountNameLimit}文字まで）</span>
          <input name="accountName" value={name} required disabled={!loaded || saving}
            onChange={(event) => { setName(event.target.value); setStatus(''); setError('') }} />
        </label>
        {error && !blocked && <p className="feedback" role="alert">{error}</p>}
        {status && <p role="status">{status}</p>}
        <button className="action" type="submit" disabled={!loaded || saving}>
          {saving ? '保存中…' : 'アカウント名を保存する'}
        </button>
      </form>
      {blocked && (
        <dialog ref={dialogRef} className="account-name-dialog" aria-labelledby="account-name-dialog-title"
          onCancel={(event) => {
            event.preventDefault()
            if (!saving) blocker.reset?.()
          }}>
          <h2 id="account-name-dialog-title">アカウント名を保存しますか？</h2>
          {error && <p className="feedback" role="alert">{error}</p>}
          <div className="account-name-dialog-actions" aria-busy={saving}>
            <button className="action" type="button" disabled={saving} onClick={() => void saveAndProceed()}>
              {saving ? '保存中…' : '保存して移動'}
            </button>
            <button className="action secondary" type="button" disabled={saving} onClick={discardAndProceed}>
              保存せず移動
            </button>
            <button ref={cancelRef} className="action secondary" type="button" disabled={saving}
              onClick={() => blocker.reset?.()}>
              キャンセル
            </button>
          </div>
        </dialog>
      )}
    </>
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
