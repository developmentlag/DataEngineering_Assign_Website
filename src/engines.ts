import * as duckdb from '@duckdb/duckdb-wasm'
import { loadPyodide, type PyodideAPI } from 'pyodide'
import type { Challenge, Dataset } from './data'

export type QueryResult = { columns: string[]; rows: Record<string, unknown>[] }

let duckConnection: duckdb.AsyncDuckDBConnection | null = null
let pythonRuntime: Promise<PyodideAPI> | null = null

function normalizeValue(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (value && typeof value === 'object' && 'toJSON' in value && typeof value.toJSON === 'function') {
    return normalizeValue(value.toJSON())
  }
  return value
}

async function getDuckConnection() {
  if (duckConnection) return duckConnection
  const bundles = duckdb.getJsDelivrBundles()
  const bundle = await duckdb.selectBundle(bundles)
  if (!bundle.mainWorker) throw new Error('The SQL engine could not find a compatible worker.')
  const workerSource = `importScripts("${bundle.mainWorker}");`
  const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
  const worker = new Worker(workerUrl)
  URL.revokeObjectURL(workerUrl)
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  duckConnection = await db.connect()
  return duckConnection
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`
}

function sqlLiteral(value: string | number | boolean | null) {
  if (value === null) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Sample data contains an invalid number.')
    return String(value)
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return `'${value.replaceAll("'", "''")}'`
}

async function loadDataset(connection: duckdb.AsyncDuckDBConnection, dataset: Dataset) {
  for (const [tableName, table] of Object.entries(dataset.tables)) {
    const tableId = quoteIdentifier(tableName)
    const columns = table.columns.map((column) => `${quoteIdentifier(column.name)} ${column.type}`).join(', ')
    await connection.query(`CREATE OR REPLACE TABLE ${tableId} (${columns})`)
    if (table.rows.length > 0) {
      const values = table.rows.map((row) => `(${row.map(sqlLiteral).join(', ')})`).join(', ')
      await connection.query(`INSERT INTO ${tableId} VALUES ${values}`)
    }
  }
}

function firstStatementOnly(code: string) {
  const trimmed = code.trim()
  if (!trimmed) throw new Error('Write a query before running it.')
  if (trimmed.replace(/;\s*$/, '').includes(';')) throw new Error('Run one query at a time.')
  if (!/^(select|with)\b/i.test(trimmed)) throw new Error('For this practice lab, start with a SELECT or WITH query.')
  return trimmed.replace(/;\s*$/, '')
}

async function queryResult(connection: duckdb.AsyncDuckDBConnection, sql: string): Promise<QueryResult> {
  const table = await connection.query(sql)
  const columns = table.schema.fields.map((field) => field.name)
  const vectors = columns.map((column) => table.getChild(column))
  const rows = Array.from({ length: table.numRows }, (_, rowIndex) =>
    Object.fromEntries(columns.map((column, columnIndex) => [column, normalizeValue(vectors[columnIndex]?.get(rowIndex))])),
  )
  return { columns, rows }
}

export async function runSql(code: string, datasets: Dataset[]): Promise<QueryResult> {
  const connection = await getDuckConnection()
  const query = firstStatementOnly(code)
  await loadDataset(connection, datasets[0])
  return queryResult(connection, query)
}

function canonicalRow(row: Record<string, unknown>) {
  return JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))))
}

function sameRows(actual: QueryResult, expected: QueryResult) {
  if (actual.columns.length !== expected.columns.length) return false
  if (actual.columns.some((column) => !expected.columns.includes(column))) return false
  const actualRows = actual.rows.map(canonicalRow).sort()
  const expectedRows = expected.rows.map(canonicalRow).sort()
  return actualRows.length === expectedRows.length && actualRows.every((row, index) => row === expectedRows[index])
}

export async function checkSql(code: string, challenge: Challenge) {
  const connection = await getDuckConnection()
  const query = firstStatementOnly(code)
  let visibleResult: QueryResult = { columns: [], rows: [] }
  for (let index = 0; index < challenge.datasets.length; index += 1) {
    const dataset = challenge.datasets[index]
    await loadDataset(connection, dataset)
    const actual = await queryResult(connection, query)
    const expected = await queryResult(connection, challenge.solution)
    if (index === 0) visibleResult = actual
    if (!sameRows(actual, expected)) {
      return {
        passed: false,
        result: visibleResult,
        message: `This does not match the expected result on "${dataset.name}". Check the return contract and edge cases.`,
      }
    }
  }
  return { passed: true, result: visibleResult, message: 'All datasets passed.' }
}

async function getPython() {
  if (!pythonRuntime) {
    pythonRuntime = loadPyodide({
      indexURL: `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
    }).catch((error: unknown) => {
      pythonRuntime = null
      throw error
    })
  }
  return pythonRuntime
}

// Keep this aligned with the npm package version in package.json.
const PYODIDE_VERSION = '0.28.2'

function pythonHarness(code: string, dataset: Dataset) {
  const rows = JSON.stringify(dataset.input ?? [])
  return `import json\ninput_data = json.loads(${JSON.stringify(rows)})\n${code}\njson.dumps(solve(input_data), default=str)`
}

function pythonOutput(value: unknown): QueryResult {
  let output: unknown
  try {
    output = JSON.parse(String(value))
  } catch {
    throw new Error('Your solve(data) function must return JSON-compatible data.')
  }
  const rows = Array.isArray(output) ? output : [output]
  if (rows.length === 0) return { columns: [], rows: [] }
  if (typeof rows[0] !== 'object' || rows[0] === null || Array.isArray(rows[0])) {
    return { columns: ['result'], rows: rows.map((item) => ({ result: item })) }
  }
  const columns = Object.keys(rows[0] as Record<string, unknown>)
  return { columns, rows: (rows as Record<string, unknown>[]).map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null]))) }
}

export async function runPython(code: string, datasets: Dataset[]): Promise<QueryResult> {
  if (!code.trim()) throw new Error('Write a function before running it.')
  const pyodide = await getPython()
  const value = await pyodide.runPythonAsync(pythonHarness(code, datasets[0]))
  return pythonOutput(value)
}

export async function checkPython(code: string, challenge: Challenge) {
  if (!code.includes('def solve(')) throw new Error('Define a function named solve(data) to return your answer.')
  const pyodide = await getPython()
  let visibleResult: QueryResult = { columns: [], rows: [] }
  for (let index = 0; index < challenge.datasets.length; index += 1) {
    const dataset = challenge.datasets[index]
    const value = await pyodide.runPythonAsync(pythonHarness(code, dataset))
    const actual = pythonOutput(value)
    const expected = pythonOutput(await pyodide.runPythonAsync(pythonHarness(challenge.solution, dataset)))
    if (index === 0) visibleResult = actual
    if (!sameRows(actual, expected)) {
      return {
        passed: false,
        result: visibleResult,
        message: `This does not match the expected result on "${dataset.name}". Check your function and edge cases.`,
      }
    }
  }
  return { passed: true, result: visibleResult, message: 'All datasets passed.' }
}

