import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { expect, it } from 'vitest'
import { App } from './App'
import { LocalStorageRepository } from './repository'
import { matchRoute } from './routes'

it.each([
  ['/Asayell/', { name: 'register' }, '目標登録'],
  ['/Asayell/feed', { name: 'feed' }, 'みんなの夢'],
  ['/Asayell/me', { name: 'profile' }, 'プロフィール'],
  ['/Asayell/export', { name: 'export' }, '集計データ出力'],
  ['/Asayell/share/goal', { name: 'share', goalId: 'goal' }, '目標を共有'],
  ['/Asayell/s/support', { name: 'support', supportToken: 'support' }, 'エールを送る'],
  ['/Asayell/o/owner', { name: 'owner', ownerToken: 'owner' }, 'エールを受け取る'],
] as const)('matches and renders %s', (path, route, heading) => {
  expect(matchRoute(path, '/Asayell/')).toEqual(route)
  const repository = new LocalStorageRepository()
  const router = createMemoryRouter([{ path: '*', element: <App route={route} repository={repository} /> }])
  const html = renderToStaticMarkup(<RouterProvider router={router} />)
  expect(html).toContain(`<h1>${heading}</h1>`)
  const navigation = html.match(/<nav[^>]*>.*?<\/nav>/)?.[0]
  expect(navigation).toBeDefined()
  expect(navigation).not.toContain('/export')
  for (const destination of ['/', '/feed', '/me']) {
    expect(navigation).toContain(`href="${destination}"`)
  }
})

it('handles unknown paths and rejects lookalike base paths', () => {
  expect(matchRoute('/Asayell/s/', '/Asayell/')).toEqual({ name: 'notFound' })
  expect(matchRoute('/Asayell-other/s/token', '/Asayell/')).toEqual({ name: 'notFound' })
  expect(matchRoute('/o/token', '/')).toEqual({ name: 'owner', ownerToken: 'token' })
})
