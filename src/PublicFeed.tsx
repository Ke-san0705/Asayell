import { useEffect, useState } from 'react'
import type { AsayellRepository, PublicGoal } from './repository'
import { routePath } from './routes'

type FeedState =
  | { kind: 'loading' | 'error' }
  | { kind: 'ready'; goals: PublicGoal[]; now: number }

const timeZone = 'Asia/Tokyo'
const calendarDate = new Intl.DateTimeFormat('sv-SE', { timeZone, dateStyle: 'short' })
const displayDate = new Intl.DateTimeFormat('ja-JP', { timeZone, month: 'numeric', day: 'numeric' })
const displayTime = new Intl.DateTimeFormat('ja-JP', {
  timeZone, hour: 'numeric', minute: '2-digit', hourCycle: 'h23',
})

function nextCalendarDate(date: string) {
  const tomorrow = new Date(`${date}T00:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  return tomorrow.toISOString().slice(0, 10)
}

function wakeLabel(wakeAt: string, now: number) {
  const wake = new Date(wakeAt)
  const today = calendarDate.format(now)
  const date = calendarDate.format(wake)
  const day = date === today ? '今日'
    : date === nextCalendarDate(today) ? '明日'
    : displayDate.format(wake)
  return `${day} ${displayTime.format(wake)} 起床`
}

export function PublicFeed({ repository }: { repository: AsayellRepository }) {
  const [feed, setFeed] = useState<FeedState>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined

    function showGoals(goals: PublicGoal[]) {
      if (!active) return
      const now = Date.now()
      const upcoming = goals.filter(({ wake_at }) => Date.parse(wake_at) > now)
      setFeed({ kind: 'ready', goals: upcoming, now })
      if (upcoming.length > 0) {
        const nextWake = Math.min(...upcoming.map(({ wake_at }) => Date.parse(wake_at)))
        const midnight = Date.parse(`${nextCalendarDate(calendarDate.format(now))}T00:00:00+09:00`)
        timer = setTimeout(() => showGoals(upcoming), Math.min(nextWake, midnight) - now)
      }
    }

    void repository.listPublicGoals().then(showGoals).catch(() => {
      if (active) setFeed({ kind: 'error' })
    })

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [repository])

  return (
    <main className="public-feed">
      <header className="feed-header">
        <a className="brand" href={import.meta.env.BASE_URL}>アサエール</a>
        <h1>みんなの夢</h1>
      </header>
      {feed.kind === 'loading' && <p className="feed-status" role="status">公開中の夢を読み込んでいます。</p>}
      {feed.kind === 'error' && (
        <p className="feed-status" role="alert">夢を読み込めませんでした。時間をおいてもう一度開いてください。</p>
      )}
      {feed.kind === 'ready' && (feed.goals.length === 0 ? (
        <div className="feed-status">
          <p role="status">公開中の夢はまだありません。</p>
          <a className="action" href={import.meta.env.BASE_URL}>自分の夢を登録する</a>
        </div>
      ) : (
        <section className="feed-reels" aria-label="公開中の夢" tabIndex={0}>
          {feed.goals.map(({ nickname, title, detail, wake_at, message_count, support_token }) => (
            <article className="feed-reel" key={support_token}>
              <div className="feed-goal">
                <p className="feed-nickname">{nickname}</p>
                <h2>{title}</h2>
                {detail && <p className="feed-detail">{detail}</p>}
                <div className="feed-meta">
                  <time dateTime={wake_at}>{wakeLabel(wake_at, feed.now)}</time>
                  <span>届いた応援 {message_count}件</span>
                </div>
                <a className="action" href={routePath('s', support_token)}>応援する</a>
              </div>
            </article>
          ))}
        </section>
      ))}
    </main>
  )
}
