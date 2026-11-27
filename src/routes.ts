export type Route =
  | { name: 'register' }
  | { name: 'share'; goalId: string }
  | { name: 'support'; supportToken: string }
  | { name: 'owner'; ownerToken: string }
  | { name: 'notFound' }

export function matchRoute(pathname: string, base: string): Route {
  const basePath = base.replace(/\/$/, '')
  if (pathname === basePath || pathname === `${basePath}/`) return { name: 'register' }
  if (!pathname.startsWith(`${basePath}/`)) return { name: 'notFound' }

  const match = /^\/(share|s|o)\/([^/]+)\/?$/.exec(pathname.slice(basePath.length))
  if (!match) return { name: 'notFound' }

  const [, section, parameter] = match
  switch (section) {
    case 'share': return { name: 'share', goalId: parameter }
    case 's': return { name: 'support', supportToken: parameter }
    case 'o': return { name: 'owner', ownerToken: parameter }
    default: return { name: 'notFound' }
  }
}
