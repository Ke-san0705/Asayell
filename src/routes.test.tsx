import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { App } from './App'
import { LocalStorageRepository } from './repository'
import { matchRoute } from './routes'

it.each([
  ['/Asayell/', { name: 'register' }, '目標登録'],
  ['/Asayell/feed', { name: 'feed' }, 'みんなの夢'],
  ['/Asayell/share/goal', { name: 'share', goalId: 'goal' }, '目標を共有'],
  ['/Asayell/s/support', { name: 'support', supportToken: 'support' }, 'エールを送る'],
  ['/Asayell/o/owner', { name: 'owner', ownerToken: 'owner' }, 'エールを受け取る'],
] as const)('matches and renders %s', (path, route, heading) => {
  expect(matchRoute(path, '/Asayell/')).toEqual(route)
  const repository = new LocalStorageRepository()
  expect(renderToStaticMarkup(<App route={route} repository={repository} />)).toContain(`<h1>${heading}</h1>`)
})

it('handles unknown paths and rejects lookalike base paths', () => {
  expect(matchRoute('/Asayell/s/', '/Asayell/')).toEqual({ name: 'notFound' })
  expect(matchRoute('/Asayell-other/s/token', '/Asayell/')).toEqual({ name: 'notFound' })
  expect(matchRoute('/o/token', '/')).toEqual({ name: 'owner', ownerToken: 'token' })
})
