import { expect, it } from 'vitest'
import { isValidRegistration, nextWakeAt } from './registrationFields'
import { routePath } from './routes'

it.each([
  ['2026-11-27T21:59:59Z', '2026-11-28T07:00:00+09:00'],
  ['2026-11-27T22:00:00Z', '2026-11-28T07:00:00+09:00'],
  ['2026-11-27T22:00:01Z', '2026-11-29T07:00:00+09:00'],
  ['2026-12-31T14:59:00Z', '2027-01-01T07:00:00+09:00'],
])('schedules the next Tokyo wake time from %s', (now, expected) => {
  expect(nextWakeAt('07:00', new Date(now))).toBe(expected)
})

it('checks required fields and character limits before submission', () => {
  const valid = { nickname: 'あ'.repeat(20), title: 'い'.repeat(100), time: '07:00' }
  expect(isValidRegistration(valid)).toBe(true)
  for (const field of ['nickname', 'title'] as const) {
    expect(isValidRegistration({ ...valid, [field]: valid[field] + ' ' })).toBe(false)
  }
  expect(isValidRegistration({ ...valid, nickname: ' ' })).toBe(false)
  expect(isValidRegistration({ ...valid, title: '' })).toBe(false)
  expect(isValidRegistration({ ...valid, time: '' })).toBe(false)
  expect(isValidRegistration({ ...valid, time: '24:00' })).toBe(false)
})

it('builds separate share, support, and owner paths under the Pages base', () => {
  expect(routePath('share', 'goal', '/Asayell/')).toBe('/Asayell/share/goal')
  expect(routePath('s', 'support', '/Asayell/')).toBe('/Asayell/s/support')
  expect(routePath('o', 'owner', '/')).toBe('/o/owner')
})
