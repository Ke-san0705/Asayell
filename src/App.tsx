import { Link } from 'react-router'
import { createContext } from 'react'
import { BottomNavigation } from './BottomNavigation'
import { Profile } from './Profile'
import { GoalRegistration } from './GoalRegistration'
import { GoalShare } from './GoalShare'
import { MorningInbox } from './MorningInbox'
import { PublicFeed } from './PublicFeed'
import type { AsayellRepository } from './repository'
import type { Route } from './routes'
import { SupportPost } from './SupportPost'

export const RepositoryContext = createContext<AsayellRepository | null>(null)

const screens = {
  register: '目標登録',
  profile: 'プロフィール',
  share: '目標を共有',
  support: 'エールを送る',
  owner: 'エールを受け取る',
  notFound: 'ページが見つかりません',
}

interface AppProps {
  route: Route
  repository: AsayellRepository
}

export function App({ route, repository }: AppProps) {
  const navigationTab = route.name === 'share' ? 'register' : route.name

  return (
    <RepositoryContext value={repository}>
      {route.name === 'feed' ? (
        <PublicFeed repository={repository} />
      ) : (
        <div className="shell">
          <header>
            <Link className="brand" to={import.meta.env.BASE_URL}>アサエール</Link>
          </header>
          <main className="card">
            <h1>{screens[route.name]}</h1>
            {route.name === 'register' && <GoalRegistration repository={repository} />}
            {route.name === 'profile' && <Profile repository={repository} />}
            {route.name === 'share' && <GoalShare key={route.goalId} repository={repository} goalId={route.goalId} />}
            {route.name === 'owner' && (
              <MorningInbox key={route.ownerToken} ownerToken={route.ownerToken} repository={repository} />
            )}
            {route.name === 'support' && (
              <SupportPost
                key={route.supportToken}
                repository={repository}
                supportToken={route.supportToken}
              />
            )}
            {route.name === 'owner' && (
              <Link to={import.meta.env.BASE_URL + 'feed'}>みんなの夢を見る</Link>
            )}
            {route.name === 'notFound' && (
              <Link className="action secondary recovery-action" to={import.meta.env.BASE_URL}>目標登録へ戻る</Link>
            )}
          </main>
        </div>
      )}
      <BottomNavigation current={navigationTab} />
    </RepositoryContext>
  )
}
