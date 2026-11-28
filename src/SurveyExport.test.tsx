// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { LocalStorageRepository, type AsayellRepository } from './repository'
import { matchRoute } from './routes'
import { SupabaseRepository } from './supabaseRepository'

const response = {
  goal_id: '8d16b980-aea1-4ac4-bafb-98a2da48f633',
  phase: 'pre',
  is_demo: false,
  q1: 1,
  q2: 2,
  q3: 3,
  continue_intent: null,
  created_at: '2026-11-29T00:00:00Z',
}
const container = document.createElement('div')
let root: ReturnType<typeof createRoot>

async function openExport(repository: AsayellRepository) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter>
        <App route={matchRoute('/export', '/')} repository={repository} />
      </MemoryRouter>,
    )
  })
}

afterEach(() => {
  act(() => root.unmount())
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('shows zero answers and disables CSV download when local storage has no responses', async () => {
  await openExport(new LocalStorageRepository())
  expect(container.textContent).toContain('0件')
  expect(container.querySelector('button')?.disabled).toBe(true)
})

it('counts saved local responses after reopening the repository', async () => {
  localStorage.setItem('asayell:survey:' + response.goal_id + ':pre', JSON.stringify({
    phase: 'pre', isDemo: false, q1: 1, q2: 2, q3: 3, consent: true,
  }))
  await openExport(new LocalStorageRepository())
  expect(container.textContent).toContain('1件')
  expect(container.querySelector('button')?.disabled).toBe(false)
})

it('calls the export RPC and downloads only the permitted CSV columns', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json([{
    ...response, nickname: 'private name', account_name: 'private account',
    body: 'private message', owner_token: 'private owner', support_token: 'private supporter',
  }]))
  const repository = new SupabaseRepository('https://example.supabase.co', 'anon', undefined, fetch)
  await openExport(repository)
  expect(fetch).toHaveBeenCalledWith('https://example.supabase.co/rest/v1/rpc/asayell_list_survey_responses',
    expect.objectContaining({ method: 'POST', body: '{}' }))
  expect(container.textContent).toContain('1件')

  const createObjectURL = vi.fn<(blob: Blob) => string>().mockReturnValue('blob:csv')
  const revoked = new Promise<void>((resolve) => {
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: resolve })
  })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  container.querySelector('button')!.click()
  expect(click).toHaveBeenCalledOnce()
  expect(click.mock.contexts[0]).toHaveProperty('download', 'asayell-survey-responses.csv')
  const csv = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(createObjectURL.mock.calls[0][0])
  })
  await revoked
  expect(csv).toBe('goal_id,phase,is_demo,q1,q2,q3,continue_intent,created_at\r\n' +
    '8d16b980-aea1-4ac4-bafb-98a2da48f633,pre,false,1,2,3,,2026-11-29T00:00:00Z\r\n')
})
