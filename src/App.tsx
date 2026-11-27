import { createContext } from 'react'
import type { AsayellRepository } from './repository'
import type { Route } from './routes'

export const RepositoryContext = createContext<AsayellRepository | null>(null)

const screens = {
  register: '目標登録',
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
  return (
    <RepositoryContext value={repository}>
      <div className="shell">
        <header>
          <a className="brand" href={import.meta.env.BASE_URL}>アサエール</a>
        </header>
        <main className="card">
          <h1>{screens[route.name]}</h1>
          {route.name === 'notFound' && (
            <a href={import.meta.env.BASE_URL}>目標登録へ戻る</a>
          )}
        </main>
      </div>
    </RepositoryContext>
  )
}
