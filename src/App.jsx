import {
  AlertCircle,
  Braces,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  Send,
  Square,
  TableProperties,
  UploadCloud,
} from 'lucide-react'
import { useDeferredValue, useMemo, useRef, useState } from 'react'
import readExcelFile from 'read-excel-file/browser'
import columnMapping from './config/column_mapping.json'
import DatabasePage from './DatabasePage.jsx'
import { EncuestaView } from './EncuestaView.tsx'
import { prepareIngestion, runIngestion } from './lib/ingestion.js'
import './App.css'

const FLOW_CONFIG = {
  PV: { label: 'PV - Après-vente', sheetName: 'Data Postventa' },
  VN: { label: 'VN / PN - Véhicule neuf', sheetName: 'Modelo Ventas' },
}

const PAGE_TITLES = {
  ingestion: 'Ingestion fichier Excel',
  database: 'Données importées',
  encuesta: 'Test enquête',
}
const MAX_FILE_SIZE = 50 * 1024 * 1024
const EXTRACTION_CHUNK_SIZE = 500

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes === 0) return '0 octet'
  const units = ['octets', 'Ko', 'Mo', 'Go']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${units[index]}`
}

function readFile(file, onProgress, readerRef) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    readerRef.current = reader
    reader.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Le fichier ne peut pas être lu.'))
    reader.onabort = () => reject(new DOMException('Lecture annulée.', 'AbortError'))
    reader.readAsArrayBuffer(file)
  })
}

async function sha256(arrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function makeColumns(headerRow) {
  const occurrences = new Map()
  return headerRow.map((value, index) => {
    const sourceHeader = String(value ?? '').trim() || `COLONNE_${index + 1}`
    const count = (occurrences.get(sourceHeader) ?? 0) + 1
    occurrences.set(sourceHeader, count)
    return {
      key: count === 1 ? sourceHeader : `${sourceHeader}__${count}`,
      sourceHeader,
      index,
    }
  })
}

function rowHasValue(row) {
  return row.some((value) => value !== null && value !== undefined && String(value).trim() !== '')
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function extractRows(workbook, sheetName, onProgress, isCancelled) {
  const worksheet = workbook.find((sheet) => sheet.sheet === sheetName)
  if (!worksheet) throw new Error(`La feuille « ${sheetName} » est introuvable.`)

  const matrix = worksheet.data
  if (matrix.length === 0) throw new Error('La feuille sélectionnée est vide.')

  const columns = makeColumns(matrix[0])
  const sourceRows = matrix.slice(1)
  const rows = []
  let blankRows = 0

  for (let start = 0; start < sourceRows.length; start += EXTRACTION_CHUNK_SIZE) {
    if (isCancelled()) throw new DOMException('Extraction annulée.', 'AbortError')
    const chunk = sourceRows.slice(start, start + EXTRACTION_CHUNK_SIZE)
    chunk.forEach((sourceRow, chunkIndex) => {
      if (!rowHasValue(sourceRow)) {
        blankRows += 1
        return
      }
      const parsedRow = { __rowNumber: start + chunkIndex + 2 }
      columns.forEach((column) => {
        const value = sourceRow[column.index]
        parsedRow[column.key] = value instanceof Date ? value.toISOString().slice(0, 10) : value ?? null
      })
      rows.push(parsedRow)
    })
    onProgress(Math.min((start + chunk.length) / Math.max(sourceRows.length, 1), 1))
    await yieldToBrowser()
  }
  return { columns, rows, blankRows, sourceRowCount: sourceRows.length }
}

function detectFlow(sheetNames, currentFlow) {
  if (sheetNames.includes(FLOW_CONFIG.PV.sheetName)) return 'PV'
  if (sheetNames.includes(FLOW_CONFIG.VN.sheetName)) return 'VN'
  return currentFlow
}

function buildIngestionPayload(file, flow, result) {
  return {
    activity: flow,
    file: {
      name: file.name,
      size: file.size,
      type: file.type,
      sha256: result.fileHash,
      sheetName: result.sheetName,
    },
    headers: result.columns.map((column) => column.sourceHeader),
    columns: result.columns.map(({ key, sourceHeader }) => ({ key, sourceHeader })),
    rows: result.rows,
  }
}

function App() {
  const fileInputRef = useRef(null)
  const readerRef = useRef(null)
  const workbookRef = useRef(null)
  const operationIdRef = useRef(0)
  const requestRef = useRef(null)

  const [flow, setFlow] = useState('PV')
  const [activePage, setActivePage] = useState('ingestion')
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [selectedSheet, setSelectedSheet] = useState('')
  const [status, setStatus] = useState('idle')
  const [stage, setStage] = useState('En attente d’un fichier')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [activeView, setActiveView] = useState('table')
  const [jsonText, setJsonText] = useState('')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [copied, setCopied] = useState(false)

  const [backendStatus, setBackendStatus] = useState('idle')
  const [backendProgress, setBackendProgress] = useState(0)
  const [backendStage, setBackendStage] = useState('En attente')
  const [backendResponse, setBackendResponse] = useState(null)
  const [publishableKey, setPublishableKey] = useState(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '')
  const [accessToken, setAccessToken] = useState('eyJhbGciOiJFUzI1NiIsImtpZCI6IjMwZjZhMjUyLTFkZmQtNDU3Zi1iNTBiLTFhZjBlMTJjYTA4YiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3JtanhybG95cnRjZnBmY2t2b295LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIxMDk3NDA1My1iY2EwLTRlNjYtOTA3MC01OGExZThhNGY0NDkiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzg1OTI3Njg3LCJpYXQiOjE3ODU5MjQwODcsImVtYWlsIjoidGVzdEBleGVtcGxlLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWxfdmVyaWZpZWQiOnRydWV9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzg1OTI0MDg3fV0sInNlc3Npb25faWQiOiJkMmFhNjhkYy04M2E1LTRmYzUtODIzYy1kM2M2ZGIzYjJmMGYiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.TpWkBpnFIyE8uvQHaLPsrnlBebomaT1o2gxMEPbOBjzwe84q7kjv5roLkLruuExT4GCd3lpAdeli0yL2OX1mDg')

  const setSurveyToken = (token) => {
    const url = new URL(window.location.href)
    url.searchParams.set('token', token)
    window.history.pushState({}, '', url)
    window.dispatchEvent(new Event('survey-token-change'))
  }
  const filteredRows = useMemo(() => {
    const rows = result?.rows ?? []
    const query = deferredSearch.trim().toLocaleLowerCase('fr')
    if (!query) return rows
    return rows.filter((row) =>
      Object.entries(row).some(
        ([key, value]) => key !== '__rowNumber' && String(value ?? '').toLocaleLowerCase('fr').includes(query),
      ),
    )
  }, [deferredSearch, result])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const visibleRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

  const reset = () => {
    operationIdRef.current += 1
    readerRef.current?.abort()
    requestRef.current?.abort()
    workbookRef.current = null
    setFile(null)
    setResult(null)
    setSelectedSheet('')
    setStatus('idle')
    setStage('En attente d’un fichier')
    setProgress(0)
    setError('')
    setActiveView('table')
    setJsonText('')
    setSearch('')
    setPage(1)
    setBackendStatus('idle')
    setBackendProgress(0)
    setBackendStage('En attente')
    setBackendResponse(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const cancelParsing = () => {
    operationIdRef.current += 1
    readerRef.current?.abort()
    setStatus('cancelled')
    setStage('Traitement annulé')
  }

  const parseSheet = async (workbook, sheetName, operationId, baseProgress = 70) => {
    setSelectedSheet(sheetName)
    setStatus('processing')
    setStage(`Extraction de « ${sheetName} »`)
    return extractRows(
      workbook,
      sheetName,
      (ratio) => setProgress(baseProgress + Math.round(ratio * (100 - baseProgress))),
      () => operationIdRef.current !== operationId,
    )
  }

  const processFile = async (selectedFile) => {
    const operationId = operationIdRef.current + 1
    operationIdRef.current = operationId
    setFile(selectedFile)
    setResult(null)
    setActiveView('table')
    setJsonText('')
    setError('')
    setPage(1)
    setSearch('')
    setBackendResponse(null)

    try {
      if (!selectedFile.name.toLocaleLowerCase('fr').endsWith('.xlsx')) {
        throw new Error('Format refusé : sélectionnez un fichier .xlsx sans macro.')
      }
      if (selectedFile.size > MAX_FILE_SIZE) throw new Error('Le fichier dépasse la limite de test de 50 Mo.')

      setStatus('processing')
      setStage('Lecture du fichier')
      setProgress(2)
      const arrayBuffer = await readFile(
        selectedFile,
        (ratio) => setProgress(2 + Math.round(ratio * 48)),
        readerRef,
      )
      if (operationIdRef.current !== operationId) return

      setStage('Calcul de l’empreinte SHA-256')
      setProgress(54)
      const hashPromise = sha256(arrayBuffer)
      setStage('Ouverture du classeur')
      setProgress(60)
      const workbook = await readExcelFile(arrayBuffer)
      workbookRef.current = workbook

      const sheetNames = workbook.map((sheet) => sheet.sheet)
      const detectedFlow = detectFlow(sheetNames, flow)
      setFlow(detectedFlow)
      const expectedSheet = FLOW_CONFIG[detectedFlow].sheetName
      const sheetName = sheetNames.includes(expectedSheet) ? expectedSheet : sheetNames[0]
      const extracted = await parseSheet(workbook, sheetName, operationId)
      const fileHash = await hashPromise
      if (operationIdRef.current !== operationId) return

      const baseResult = {
        ...extracted,
        fileHash,
        sheetNames,
        sheetName,
        expectedSheet,
        expectedColumnCount: 37,
      }
      setStage('Transformation vers la structure Supabase')
      setProgress(94)
      const prepared = await prepareIngestion(buildIngestionPayload(selectedFile, detectedFlow, baseResult), columnMapping)
      if (operationIdRef.current !== operationId) return
      setResult({
        ...baseResult,
        databaseRows: prepared.rows,
        databaseBatch: prepared.batch,
        mappingVersion: prepared.mappingVersion,
      })
      setStatus('ready')
      setStage('Fichier prêt')
      setProgress(100)
    } catch (caughtError) {
      if (caughtError.name === 'AbortError') return
      setStatus('error')
      setStage('Échec du traitement')
      setProgress(0)
      setError(caughtError.message || 'Une erreur inconnue est survenue.')
    }
  }

  const handleSheetChange = async (event) => {
    const sheetName = event.target.value
    const workbook = workbookRef.current
    if (!workbook) return
    const operationId = operationIdRef.current + 1
    operationIdRef.current = operationId
    setJsonText('')
    setError('')
    setProgress(70)
    try {
      const extracted = await parseSheet(workbook, sheetName, operationId)
      if (operationIdRef.current !== operationId) return
      const baseResult = { ...result, ...extracted, sheetName }
      setStage('Transformation vers la structure Supabase')
      setProgress(94)
      const prepared = await prepareIngestion(buildIngestionPayload(file, flow, baseResult), columnMapping)
      if (operationIdRef.current !== operationId) return
      setResult({
        ...baseResult,
        databaseRows: prepared.rows,
        databaseBatch: prepared.batch,
        mappingVersion: prepared.mappingVersion,
      })
      setStatus('ready')
      setStage('Fichier prêt')
      setProgress(100)
      setPage(1)
    } catch (caughtError) {
      if (caughtError.name === 'AbortError') return
      setStatus('error')
      setError(caughtError.message)
    }
  }

  const openJson = () => {
    setActiveView('json')
    if (!jsonText && result) setJsonText(JSON.stringify(result.databaseRows, null, 2))
  }

  const downloadJson = () => {
    if (!result || !file) return
    const content = jsonText || JSON.stringify(result.databaseRows, null, 2)
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${file.name.replace(/\.xlsx$/i, '')}.database.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const copyJson = async () => {
    if (!result) return
    const content = jsonText || JSON.stringify(result.databaseRows, null, 2)
    await navigator.clipboard.writeText(content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const sendToSupabase = async (dryRun) => {
    if (!result || !file) return
    if (!dryRun && !publishableKey.trim()) {
      setBackendStatus('error')
      setBackendStage('Clé publique manquante')
      setBackendResponse({ error: 'Renseignez une clé sb_publishable_* ou anon. La clé sb_secret_* est interdite dans le navigateur.' })
      return
    }
    if (!dryRun && !window.confirm(`Confirmer l'insertion de ${result.rows.length} ligne(s) dans Supabase ?`)) return
    const controller = new AbortController()
    requestRef.current = controller
    setBackendStatus('sending')
    setBackendProgress(0)
    setBackendStage(dryRun ? 'Simulation en cours' : 'Connexion directe à Supabase')
    setBackendResponse(null)
    const payload = buildIngestionPayload(file, flow, result)
    try {
      const response = await runIngestion(payload, {
        mapping: columnMapping,
        prepared: {
          batch: result.databaseBatch,
          rows: result.databaseRows,
          mappingVersion: result.mappingVersion,
        },
        publicKey: publishableKey,
        accessToken,
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        dryRun,
        signal: controller.signal,
        onProgress: ({ progress: currentProgress, message }) => {
          setBackendProgress(currentProgress)
          setBackendStage(message)
        },
      })
      setBackendProgress(100)
      setBackendStatus('success')
      setBackendStage(dryRun ? 'Simulation validée' : 'Insertion terminée')
      setBackendResponse(response)
    } catch (caughtError) {
      if (caughtError.name === 'AbortError') {
        setBackendStatus('cancelled')
        setBackendStage('Traitement interrompu')
      } else {
        setBackendStatus('error')
        setBackendStage('Échec du traitement')
        setBackendResponse({ error: caughtError.message, status: caughtError.status, details: caughtError.details })
      }
    } finally {
      requestRef.current = null
    }
  }

  const technicalChecks = result ? [
    { label: 'Extension .xlsx', valid: file?.name.toLowerCase().endsWith('.xlsx') },
    { label: `Feuille ${FLOW_CONFIG[flow].sheetName}`, valid: result.sheetName === FLOW_CONFIG[flow].sheetName },
    { label: '37 colonnes', valid: result.columns.length === result.expectedColumnCount },
    { label: 'Taille ≤ 50 Mo', valid: (file?.size ?? 0) <= MAX_FILE_SIZE },
  ] : []

  return (
    <main className="app-shell">
      <div className="app-header">
        <div><p className="eyebrow">CSI Stellantis</p><h1>{PAGE_TITLES[activePage]}</h1></div>
        {activePage === 'ingestion' && <div className={`status-pill status-${status}`}>
          {status === 'processing' && <LoaderCircle size={16} className="spin" />}
          {status === 'ready' && <CheckCircle2 size={16} />}
          {status === 'error' && <AlertCircle size={16} />}
          {stage}
        </div>}
      </div>

      <nav className="page-navigation" aria-label="Pages de l'outil"><button type="button" className={activePage === 'ingestion' ? 'active' : ''} onClick={() => setActivePage('ingestion')}><UploadCloud size={17} />Ingestion</button><button type="button" className={activePage === 'database' ? 'active' : ''} onClick={() => setActivePage('database')}><Database size={17} />Données BDD</button><button type="button" className={activePage === 'encuesta' ? 'active' : ''} onClick={() => setActivePage('encuesta')}><Clipboard size={17} />Encuesta</button></nav>

      {activePage === 'ingestion' ? <>
      <section className="toolbar" aria-label="Sélection du flux et du fichier">
        <label className="field compact-field"><span>Flux</span><select value={flow} onChange={(event) => setFlow(event.target.value)} disabled={status === 'processing' || Boolean(file)}>{Object.entries(FLOW_CONFIG).map(([value, config]) => <option value={value} key={value}>{config.label}</option>)}</select></label>
        <input ref={fileInputRef} className="visually-hidden" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => event.target.files?.[0] && processFile(event.target.files[0])} />
        <button className="button primary" type="button" onClick={() => fileInputRef.current?.click()} disabled={status === 'processing'}><UploadCloud size={18} />Choisir un fichier</button>
        {status === 'processing' && <button className="button danger" type="button" onClick={cancelParsing}><Square size={16} />Interrompre</button>}
        {(file || error) && status !== 'processing' && <button className="button secondary" type="button" onClick={reset}><RotateCcw size={17} />Réinitialiser</button>}
      </section>

      {!file && !error && <section className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const droppedFile = event.dataTransfer.files?.[0]; if (droppedFile) processFile(droppedFile) }}><FileSpreadsheet size={40} /><strong>Déposer un fichier Excel</strong><span>.xlsx · 50 Mo maximum</span></section>}

      {(status === 'processing' || status === 'cancelled') && <section className="progress-panel" aria-live="polite"><div className="progress-row"><span>{stage}</span><strong>{progress}%</strong></div><div className="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><div className="progress-value" style={{ width: `${progress}%` }} /></div></section>}

      {error && <section className="message error-message" role="alert"><AlertCircle size={20} /><div><strong>Fichier refusé</strong><span>{error}</span></div></section>}

      {result && file && <>
        <section className="summary-grid" aria-label="Résumé du fichier">
          <article><FileSpreadsheet size={20} /><span>Fichier</span><strong title={file.name}>{file.name}</strong></article>
          <article><Database size={20} /><span>Taille</span><strong>{formatBytes(file.size)}</strong></article>
          <article><TableProperties size={20} /><span>Lignes</span><strong>{result.rows.length.toLocaleString('fr-FR')}</strong></article>
          <article><Braces size={20} /><span>Colonnes</span><strong>{result.columns.length}</strong></article>
        </section>

        <section className="file-details">
          <div className="details-main"><label className="field"><span>Feuille</span><select value={selectedSheet} onChange={handleSheetChange} disabled={status === 'processing'}>{result.sheetNames.map((sheetName) => <option key={sheetName}>{sheetName}</option>)}</select></label><div className="hash-field"><span>SHA-256</span><code>{result.fileHash}</code></div></div>
          <div className="checks" aria-label="Contrôles techniques rapides">{technicalChecks.map((check) => <span className={check.valid ? 'check-valid' : 'check-invalid'} key={check.label}>{check.valid ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}{check.label}</span>)}</div>
        </section>

        <section className="headers-panel"><div className="section-heading"><div><h2>En-têtes</h2><span>{result.columns.length} colonnes détectées</span></div></div><div className="header-list">{result.columns.map((column, index) => <span key={column.key}><b>{index + 1}</b>{column.sourceHeader}</span>)}</div></section>

        <section className="data-panel">
          <div className="data-toolbar"><div className="tabs" role="tablist" aria-label="Format des données"><button className={activeView === 'table' ? 'active' : ''} type="button" onClick={() => setActiveView('table')}><TableProperties size={17} />Tableau</button><button className={activeView === 'json' ? 'active' : ''} type="button" onClick={openJson}><FileJson size={17} />JSON</button></div><div className="data-actions"><button className="button secondary small" type="button" onClick={downloadJson}><Download size={16} />JSON</button><button className="button secondary small" type="button" onClick={copyJson}><Clipboard size={16} />{copied ? 'Copié' : 'Copier'}</button></div></div>
          {activeView === 'table' ? <>
            <div className="table-controls"><label className="search-field"><span>Filtrer</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Valeur dans les lignes" /></label><span>{filteredRows.length.toLocaleString('fr-FR')} ligne(s)</span></div>
            <div className="table-scroll"><table><thead><tr><th className="row-number">Ligne</th>{result.columns.map((column) => <th key={column.key}>{column.sourceHeader}</th>)}</tr></thead><tbody>{visibleRows.map((row) => <tr key={row.__rowNumber}><td className="row-number">{row.__rowNumber}</td>{result.columns.map((column) => <td key={column.key} title={String(row[column.key] ?? '')}>{String(row[column.key] ?? '')}</td>)}</tr>)}</tbody></table></div>
            <div className="pagination"><label>Par page<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}><option>25</option><option>50</option><option>100</option></select></label><span>Page {page} / {pageCount}</span><button type="button" title="Page précédente" aria-label="Page précédente" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}><ChevronLeft size={18} /></button><button type="button" title="Page suivante" aria-label="Page suivante" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount}><ChevronRight size={18} /></button></div>
          </> : <textarea className="json-view" value={jsonText} readOnly aria-label="Toutes les lignes au format JSON" />}
        </section>

        <section className="backend-panel">
          <div className="section-heading"><div><h2>Connexion directe Supabase</h2><span>React → chargements et uploads</span></div></div>
          <div className="backend-note"><Database size={18} /><span>Aucune API intermédiaire. Supabase applique directement les règles RLS à la clé publique ou au jeton utilisateur.</span></div>
          <div className="backend-fields"><label className="field"><span>Clé publique Supabase</span><input type="password" value={publishableKey} onChange={(event) => setPublishableKey(event.target.value)} placeholder="sb_publishable_... ou clé anon" autoComplete="off" /></label><label className="field"><span>Jeton utilisateur (optionnel)</span><input type="password" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} placeholder="JWT d'une session authentifiée" autoComplete="off" /></label></div>
          {!publishableKey.trim() && <div className="configuration-warning"><AlertCircle size={17} /><span>L’insertion attend une clé publique. La simulation reste disponible sans connexion.</span></div>}
          <div className="backend-actions"><button className="button secondary" type="button" onClick={() => sendToSupabase(true)} disabled={backendStatus === 'sending'}><Braces size={17} />Simuler le mapping</button><button className="button primary" type="button" onClick={() => sendToSupabase(false)} disabled={backendStatus === 'sending' || !publishableKey.trim()}><Send size={17} />Insérer dans Supabase</button>{backendStatus === 'sending' && <button className="button danger" type="button" onClick={() => requestRef.current?.abort()}><Square size={16} />Interrompre</button>}</div>
          {backendStatus !== 'idle' && <div className="backend-result"><div className="progress-row"><span>{backendStage}</span><strong>{backendProgress}%</strong></div><div className="progress-track"><div className="progress-value backend-progress" style={{ width: `${backendProgress}%` }} /></div>{backendResponse && <pre>{JSON.stringify(backendResponse, null, 2)}</pre>}</div>}
        </section>
      </>}
      </> : activePage === 'database' ? <DatabasePage publicKey={publishableKey} setPublicKey={setPublishableKey} accessToken={accessToken} setAccessToken={setAccessToken} /> : <><section className="toolbar encuesta-test-toolbar" aria-label="Choix du questionnaire de test"><button className="button secondary" type="button" onClick={() => setSurveyToken('demo-pv')}>PV / Posventa</button><button className="button secondary" type="button" onClick={() => setSurveyToken('demo-vn')}>VN / Venta</button><button className="button secondary" type="button" onClick={() => setSurveyToken('token-invalide')}>Token invalide</button><span className="survey-test-hint">Tokens: demo-pv, demo-vn</span></section><EncuestaView /></>}
    </main>
  )
}

export default App


