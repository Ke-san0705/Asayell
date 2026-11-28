const destinations = [
  { name: 'register', path: '', icon: '✎', label: '投稿' },
  { name: 'feed', path: 'feed', icon: '☀', label: 'みんなの夢' },
  { name: 'profile', path: 'me', icon: '👤', label: 'プロフィール' },
] as const

export function BottomNavigation({ current }: { current: typeof destinations[number]['name'] }) {
  return (
    <nav className="bottom-navigation" aria-label="メインナビゲーション">
      <ul>
        {destinations.map(({ name, path, icon, label }) => (
          <li key={name}>
            <a href={import.meta.env.BASE_URL + path} aria-current={name === current ? 'page' : undefined}>
              <span aria-hidden="true">{icon}</span>
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
