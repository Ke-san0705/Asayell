import { useEffect, useState } from 'react'
import type { AsayellRepository, SurveyResponseRow } from './repository'

type ExportState =
  | { kind: 'loading' | 'error' }
  | { kind: 'ready'; responses: SurveyResponseRow[] }

const columns = ['goal_id', 'phase', 'is_demo', 'q1', 'q2', 'q3', 'continue_intent', 'created_at'] as const

function downloadCsv(responses: SurveyResponseRow[]) {
  const rows = responses.map((response) => columns.map((column) => {
    const value = String(response[column] ?? '')
    return /[",\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value
  }).join(','))
  const csv = [columns.join(','), ...rows, ''].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'asayell-survey-responses.csv'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function SurveyExport({ repository }: { repository: AsayellRepository }) {
  const [state, setState] = useState<ExportState>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    void repository.listSurveyResponses().then((responses) => {
      if (active) setState({ kind: 'ready', responses })
    }).catch(() => {
      if (active) setState({ kind: 'error' })
    })
    return () => { active = false }
  }, [repository])

  const responses = state.kind === 'ready' ? state.responses : []
  return (
    <>
      {state.kind === 'loading' && <p role="status">回答を読み込んでいます。</p>}
      {state.kind === 'error' && <p role="alert">回答を読み込めませんでした。時間をおいてもう一度開いてください。</p>}
      {state.kind === 'ready' && (
        <p role="status">回答件数 {responses.length}件{responses.length === 0 && '。出力できる回答はまだありません。'}</p>
      )}
      <button className="action" type="button" disabled={responses.length === 0} onClick={() => downloadCsv(responses)}>
        CSVをダウンロード
      </button>
    </>
  )
}
