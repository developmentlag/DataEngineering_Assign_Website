import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronUp, Code2, Database, Lightbulb, Play, RotateCcw, Sparkles, Square } from 'lucide-react'
import { challenges, type Dataset, type Language } from './data'
import { checkPython, checkSql, runPython, runSql, type QueryResult } from './engines'
import './App.css'

type StoredState = {
  active: Record<Language, number>
  solved: Record<Language, number[]>
  drafts: Record<string, string>
}

const storageKey = 'dim-sql-lab-v1'
const initialState: StoredState = { active: { sql: 0, python: 0 }, solved: { sql: [], python: [] }, drafts: {} }
const titles: Record<Language, string> = { sql: 'SQL', python: 'Python' }

function readState(): StoredState {
  try {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return initialState
    const parsed = JSON.parse(saved) as Partial<StoredState>
    return {
      active: { ...initialState.active, ...parsed.active },
      solved: { ...initialState.solved, ...parsed.solved },
      drafts: parsed.drafts ?? {},
    }
  } catch {
    return initialState
  }
}

function toDisplay(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function ResultTable({ result }: { result: QueryResult }) {
  if (!result.columns.length) return <p className="empty-copy">Query completed with no rows returned.</p>
  return (
    <div className="table-scroll">
      <table>
        <thead><tr>{result.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {result.rows.slice(0, 100).map((row, index) => (
            <tr key={index}>{result.columns.map((column) => <td key={column}>{toDisplay(row[column])}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {result.rows.length > 100 && <div className="table-caption">Showing first 100 of {result.rows.length} rows.</div>}
    </div>
  )
}

function DatasetTables({ dataset }: { dataset: Dataset }) {
  return (
    <div className="dataset-stack">
      {Object.entries(dataset.tables).map(([name, table]) => (
        <details className="data-table" key={name} open>
          <summary><span><Database size={14} /> {name}</span><span>{table.rows.length} rows <ChevronDown size={14} /></span></summary>
          <div className="table-scroll">
            <table><thead><tr>{table.columns.map((column) => <th key={column.name}>{column.name}<small>{column.type}</small></th>)}</tr></thead>
              <tbody>{table.rows.slice(0, 8).map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{toDisplay(cell)}</td>)}</tr>)}</tbody>
            </table>
            {table.rows.length > 8 && <div className="table-caption">Showing 8 of {table.rows.length} rows.</div>}
          </div>
        </details>
      ))}
    </div>
  )
}

function App() {
  const [stored, setStored] = useState<StoredState>(readState)
  const [language, setLanguage] = useState<Language>('sql')
  const [tab, setTab] = useState<'brief' | 'data' | 'expected'>('brief')
  const [hintIndex, setHintIndex] = useState(0)
  const [solutionOpen, setSolutionOpen] = useState(false)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [expectedResult, setExpectedResult] = useState<QueryResult | null>(null)
  const [expectedBusy, setExpectedBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'neutral'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [engineStatus, setEngineStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  const track = challenges[language]
  const index = Math.min(stored.active[language], track.length - 1)
  const challenge = track[index]
  const draftKey = `${language}:${challenge.id}`
  const code = stored.drafts[draftKey] ?? challenge.starter
  const solved = stored.solved[language].includes(challenge.id)
  const progress = stored.solved[language].length
  const dataset = challenge.datasets[0]
  const solvedIds = useMemo(() => new Set(stored.solved[language]), [stored.solved, language])

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(stored))
  }, [stored])

  useEffect(() => {
    let active = true
    const initialize = async () => {
      try {
        const emptyDataset: Dataset = { name: 'Engine check', tables: {}, input: [] }
        if (language === 'sql') await runSql('SELECT 1 AS ready', [emptyDataset])
        else await runPython('def solve(data):\n    return data', [emptyDataset])
        if (active) setEngineStatus('ready')
      } catch {
        if (active) setEngineStatus('error')
      }
    }
    void initialize()
    return () => { active = false }
  }, [language])

  function updateStored(next: (previous: StoredState) => StoredState) {
    setStored((previous) => next(previous))
  }

  function setCode(value: string) {
    updateStored((previous) => ({ ...previous, drafts: { ...previous.drafts, [draftKey]: value } }))
  }

  function selectChallenge(nextIndex: number) {
    updateStored((previous) => ({ ...previous, active: { ...previous.active, [language]: nextIndex } }))
    clearChallengeView()
    setMobileNavOpen(false)
  }

  function clearChallengeView() {
    setResult(null)
    setExpectedResult(null)
    setMessage(null)
    setHintIndex(0)
    setSolutionOpen(false)
    setTab('brief')
  }

  function selectLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage)
    setEngineStatus('loading')
    clearChallengeView()
  }

  async function run(check: boolean) {
    if (busy) return
    setBusy(true)
    setMessage(null)
    setResult(null)
    try {
      if (language === 'sql') {
        if (check) {
          const outcome = await checkSql(code, challenge)
          setResult(outcome.result)
          if (outcome.passed) {
            setMessage({ kind: 'success', text: `Passed all ${challenge.datasets.length} dataset checks. Nice work.` })
            updateStored((previous) => previous.solved[language].includes(challenge.id) ? previous : ({
              ...previous,
              solved: { ...previous.solved, [language]: [...previous.solved[language], challenge.id] },
            }))
          } else {
            setMessage({ kind: 'error', text: outcome.message })
          }
        } else {
          setResult(await runSql(code, [dataset]))
          setMessage({ kind: 'neutral', text: 'Query ran on the sample dataset.' })
        }
      } else {
        const output = await runPython(code, [dataset])
        setResult(output)
        if (check) {
          const passed = await checkPython(code, challenge)
          if (passed.passed) {
            setMessage({ kind: 'success', text: `Passed all ${challenge.datasets.length} dataset checks. Nice work.` })
            updateStored((previous) => previous.solved[language].includes(challenge.id) ? previous : ({
              ...previous,
              solved: { ...previous.solved, [language]: [...previous.solved[language], challenge.id] },
            }))
          } else {
            setMessage({ kind: 'error', text: passed.message })
          }
        } else {
          setMessage({ kind: 'neutral', text: 'Code ran on the sample dataset.' })
        }
      }
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Execution failed. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  async function loadExpected() {
    if (expectedBusy) return
    setExpectedBusy(true)
    try {
      const sample = challenge.datasets[0]
      const expected = language === 'sql'
        ? await runSql(challenge.solution, [sample])
        : await runPython(challenge.solution, [sample])
      setExpectedResult(expected)
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Could not load expected output.' })
    } finally {
      setExpectedBusy(false)
    }
  }

  function resetChallenge() {
    setCode(challenge.starter)
    setResult(null)
    setMessage({ kind: 'neutral', text: 'Editor reset to the starter code.' })
  }

  function handleEditorKey(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      void run(event.shiftKey)
    } else if (event.key === 'Tab') {
      event.preventDefault()
      const target = event.currentTarget
      const start = target.selectionStart
      const end = target.selectionEnd
      const next = `${code.slice(0, start)}  ${code.slice(end)}`
      setCode(next)
      requestAnimationFrame(() => { target.selectionStart = target.selectionEnd = start + 2 })
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Data Institute Mumbai SQL and Python Practice Lab">
          <span className="brand-icon"><img src="/brand-symbol-color.png" alt="" /></span>
          <span className="brand-copy"><strong>Data Institute Mumbai</strong><small>SQL &amp; PYTHON PRACTICE</small></span>
        </a>
        <div className="language-control">
          <label htmlFor="language">PRACTICE IN</label>
          <select id="language" value={language} onChange={(event) => selectLanguage(event.target.value as Language)}>
            <option value="sql">SQL</option><option value="python">Python</option>
          </select>
        </div>
        <div className={`engine-indicator ${engineStatus}`} role="status"><i />{engineStatus === 'ready' ? 'Ready in your browser' : engineStatus === 'error' ? 'Engine unavailable' : 'Starting practice engine…'}</div>
        <button className="text-button guide-trigger" onClick={() => setGuideOpen((open) => !open)}><BookOpen size={15} /> Quick guide</button>
        <button className="text-button mobile-trigger" onClick={() => setMobileNavOpen((open) => !open)} aria-expanded={mobileNavOpen}>Challenges <ChevronDown size={15} /></button>
      </header>

      <div className="workbench">
        <aside className={`challenge-rail ${mobileNavOpen ? 'mobile-open' : ''}`}>
          <div className="rail-head">
            <span className="eyebrow">THE QUESTION SET</span>
            <div className="track-heading"><h1>{titles[language]}</h1><span>{track.length} challenges</span></div>
          </div>
          <div className="progress-block">
            <div><span>YOUR PROGRESS</span><strong>{progress} / {track.length}</strong></div>
            <div className="progress-track"><span style={{ width: `${(progress / track.length) * 100}%` }} /></div>
          </div>
          <nav className="challenge-list" aria-label={`${titles[language]} challenges`}>
            {track.map((item, itemIndex) => (
              <button key={item.id} className={`challenge-link ${itemIndex === index ? 'active' : ''} ${solvedIds.has(item.id) ? 'solved' : ''}`} onClick={() => selectChallenge(itemIndex)}>
                <span className="challenge-index">{solvedIds.has(item.id) ? <Check size={14} /> : String(itemIndex + 1).padStart(2, '0')}</span>
                <span className="challenge-link-copy"><b>{item.title}</b><small>{item.tags.slice(0, 2).join(' · ')}</small></span>
                {itemIndex === index && <span className="active-dot" />}
              </button>
            ))}
          </nav>
          <div className="rail-bottom">
            <span className="eyebrow">HOW TO PRACTICE</span>
            <p>Understand the logic.<br />Then test the edges.</p>
            <span className="runtime-note"><Database size={13} /> {language === 'sql' ? 'DuckDB · browser runtime' : 'Python · browser runtime'}</span>
            <small>Your drafts and progress are saved on this device.</small>
          </div>
        </aside>

        <main className="main-content">
          {guideOpen && <section className="guide-card">
            <div><span className="eyebrow">A GOOD PLACE TO START</span><h2>Read the contract. Explore the data. Make your case.</h2><p>Each challenge includes realistic synthetic data, clear constraints, hints, and a worked solution.</p></div>
            <ol><li><b>01</b><span>Read the brief<small>Watch the boundaries</small></span></li><li><b>02</b><span>Write & run<small>Inspect your output</small></span></li><li><b>03</b><span>Check & explain<small>Test every dataset</small></span></li></ol>
            <button className="icon-button" aria-label="Close guide" onClick={() => setGuideOpen(false)}>×</button>
          </section>}

          <div className="challenge-heading">
            <div>
              <div className="challenge-kicker"><span>{titles[language]} / CHALLENGE {String(index + 1).padStart(2, '0')}</span><span className="difficulty">{challenge.difficulty}</span></div>
              <h2>{challenge.title}</h2>
              <div className="tag-row">{challenge.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            </div>
            <div className={`attempt-state ${solved ? 'is-solved' : ''}`}>{solved && <Check size={14} />}{solved ? 'Solved' : result ? 'Attempted' : 'Not attempted'}</div>
          </div>

          <div className="opening-note"><span className="step-marker">01—03</span><p>Read the rules, inspect the tables, then write a {language === 'sql' ? 'query' : 'function'}. Run to explore. Check answer tests the edge cases.</p></div>

          <div className="practice-layout">
            <section className="problem-pane">
              <div className="pane-tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'brief'} className={tab === 'brief' ? 'selected' : ''} onClick={() => setTab('brief')}>The brief</button>
                <button role="tab" aria-selected={tab === 'data'} className={tab === 'data' ? 'selected' : ''} onClick={() => setTab('data')}>Dataset <span className="tab-count">{Object.keys(dataset.tables).length}</span></button>
                <button role="tab" aria-selected={tab === 'expected'} className={tab === 'expected' ? 'selected' : ''} onClick={() => setTab('expected')}>Expected output</button>
              </div>

              {tab === 'brief' && <div className="pane-content">
                <p className="prompt-text">{challenge.prompt}</p>
                <h3 className="section-label">YOUR CONSTRAINTS</h3>
                <ol className="constraint-list">{challenge.constraints.map((constraint) => <li key={constraint}>{constraint}</li>)}</ol>
                <div className="return-contract"><span className="section-label">RETURN CONTRACT</span><p>{challenge.contract}</p></div>
                <section className="hint-panel">
                  <div className="hint-title"><h3><Lightbulb size={15} /> Need a nudge?</h3><span>{hintIndex} / {challenge.hints.length}</span></div>
                  {hintIndex > 0 && <ol className="hints">{challenge.hints.slice(0, hintIndex).map((hint, hintNumber) => <li key={hint}>{hintNumber + 1}. {hint}</li>)}</ol>}
                  <button className="hint-button" disabled={hintIndex >= challenge.hints.length} onClick={() => setHintIndex((value) => Math.min(value + 1, challenge.hints.length))}>{hintIndex >= challenge.hints.length ? 'All hints revealed' : `Reveal ${hintIndex ? 'next' : 'first'} hint`} <ArrowDown size={13} /></button>
                </section>
                <section className="solution-teaser">
                  <div><h3>Understand the reasoning</h3><p>Compare your approach with a complete solution and explanation.</p></div>
                  <button className="secondary-button" onClick={() => setSolutionOpen((open) => !open)}>{solutionOpen ? 'Hide solution' : 'Reveal solution'} {solutionOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
                </section>
                {solutionOpen && <div className="solution-box"><pre>{challenge.solution}</pre><p>{challenge.explanation}</p></div>}
              </div>}
              {tab === 'data' && <div className="pane-content"><p className="supporting-copy">Synthetic sample data for this challenge. The checker also uses a second edge-case dataset.</p><DatasetTables dataset={dataset} /></div>}
              {tab === 'expected' && <div className="pane-content"><p className="supporting-copy">Your result is checked against the contract on every supplied dataset. Row order is ignored for SQL results; column names and values must match.</p>{expectedResult ? <ResultTable result={expectedResult} /> : <button className="expected-empty" onClick={() => void loadExpected()} disabled={expectedBusy}><Sparkles size={16} /><span>{expectedBusy ? 'Loading reference output…' : 'Show expected sample output'}</span></button>}<h3 className="section-label">WHY THIS RESULT?</h3><p className="supporting-copy">{challenge.explanation}</p></div>}
            </section>

            <div className="execution-pane">
              <section className="editor-card">
                <div className="editor-heading"><label htmlFor="code-editor"><Code2 size={15} /><span>solution.{language === 'sql' ? 'sql' : 'py'}</span></label><span>{language === 'sql' ? 'DuckDB SQL' : 'Python 3'}</span></div>
                <div className="editor-body">
                  <div className="line-numbers" aria-hidden="true">{code.split('\n').map((_, line) => <span key={line}>{line + 1}</span>)}</div>
                  <textarea id="code-editor" ref={editorRef} value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={handleEditorKey} spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-label="Code editor" />
                </div>
                <div className="editor-hint"><span>Tab to indent</span><span>Ctrl / ⌘ + Enter runs · Shift also checks</span><span>8s / dataset</span></div>
                <div className="editor-actions"><div className="run-controls"><button className="run-button" disabled={busy || engineStatus !== 'ready'} onClick={() => void run(false)}>{busy ? <span className="spinner" /> : <Play size={13} fill="currentColor" />} Run code</button><button className="check-button" disabled={busy || engineStatus !== 'ready'} onClick={() => void run(true)}><Check size={14} /> Check answer</button>{busy && <button className="stop-button" onClick={() => setMessage({ kind: 'neutral', text: 'Execution is running locally.' })}><Square size={12} /> Running</button>}</div><button className="reset-button" onClick={resetChallenge}><RotateCcw size={13} /> Reset</button></div>
              </section>

              <section className="output-card">
                <div className="output-heading"><div><span className="output-glyph">≡</span><h3>Output</h3></div><span>{result ? `${result.rows.length} rows` : 'No run yet'}</span></div>
                {message && <div className={`feedback ${message.kind}`}>{message.kind === 'success' ? <Check size={15} /> : message.kind === 'error' ? <span className="feedback-mark">!</span> : <Sparkles size={15} />}{message.text}</div>}
                {result ? <ResultTable result={result} /> : <div className="output-empty"><span>↳</span><h3>Let the data answer.</h3><p>Run your code to inspect the result.<br />Check answer validates every dataset.</p></div>}
              </section>
              <div className="workspace-foot"><span>{challenge.datasets.length} datasets · {dataset.tables ? Object.values(dataset.tables).reduce((count, table) => count + table.rows.length, 0) : 0} sample rows</span><span>Fresh data for every run</span><span>Runs stay on your device</span></div>
            </div>
          </div>

          <div className="question-pagination"><button className="secondary-button" disabled={index === 0} onClick={() => selectChallenge(Math.max(0, index - 1))}><ArrowLeft size={14} /> Previous challenge</button><span>{String(index + 1).padStart(2, '0')} / {String(track.length).padStart(2, '0')}</span><button className="primary-button" disabled={index === track.length - 1} onClick={() => selectChallenge(Math.min(track.length - 1, index + 1))}>Next challenge <ArrowRight size={14} /></button></div>
          <footer className="site-footer"><span className="footer-brand"><strong>Data Institute Mumbai</strong><span>Built for deliberate practice</span></span><span>Original synthetic business scenarios</span><a href={language === 'sql' ? 'https://duckdb.org/docs/stable/sql/introduction' : 'https://docs.python.org/3/tutorial/'} target="_blank" rel="noreferrer">Reference guide</a></footer>
        </main>
      </div>
    </div>
  )
}

export default App
