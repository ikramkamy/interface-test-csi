import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  History,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Square,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { inspectBrowserAccessToken, validateBrowserAccessToken } from './lib/auth.js'
import { historyEntries, modificationEntries } from './lib/database-view.js'

const DISPLAY_COLUMNS = [
  { key: 'flow_type', label: 'Flux' },
  { key: 'file_name', label: 'Fichier' },
  { key: 'row_number', label: 'Ligne' },
  { key: 'market_name', label: 'Marché' },
  { key: 'dealer_code', label: 'Code dealer' },
  { key: 'dealer_name', label: 'Dealer' },
  { key: 'vin', label: 'VIN' },
  { key: 'brand', label: 'Marque' },
  { key: 'model', label: 'Modèle' },
  { key: 'engine', label: 'Motorisation' },
  { key: 'color', label: 'Couleur' },
  { key: 'delivery_date', label: 'Date livraison' },
  { key: 'sales_channel', label: 'Canal de vente' },
  { key: 'workshop_exit_date', label: 'Sortie atelier' },
  { key: 'intervention_type', label: 'Intervention' },
  { key: 'customer_name', label: 'Client' },
  { key: 'customer_email', label: 'E-mail' },
  { key: 'customer_mobile', label: 'Mobile' },
  { key: 'advisor_code', label: 'Code conseiller' },
  { key: 'advisor_name', label: 'Conseiller' },
  { key: 'survey', label: 'Survey' },
  { key: 'version', label: 'Version' },
  { key: 'imported_at', label: 'Importé le' },
]

const DETAIL_SECTIONS = [
  {
    title: 'Traçabilité',
    fields: [
      ['id', 'ID'], ['flow_type', 'Flux'], ['batch_id', 'Batch'], ['file_name', 'Fichier'],
      ['file_sha256', 'SHA-256 fichier'], ['sheet_name', 'Feuille'], ['row_number', 'Ligne'],
      ['row_hash', 'Hash ligne'], ['data_hash', 'Hash données'], ['survey', 'Survey'],
      ['version', 'Version'], ['mapping_version', 'Version mapping'], ['imported_at', 'Importé le'],
    ],
  },
  {
    title: 'Marché et dealer',
    fields: [
      ['market_name', 'Marché'], ['market_code', 'Code marché'], ['dealer_code', 'Code dealer'],
      ['dealer_name', 'Dealer'], ['site', 'Site'], ['advisor_code', 'Code conseiller'],
      ['advisor_name', 'Conseiller'],
    ],
  },
  {
    title: 'Véhicule et vente',
    fields: [
      ['vin', 'VIN'], ['brand', 'Marque'], ['model', 'Modèle'], ['engine', 'Motorisation'],
      ['license_plate', 'Immatriculation'], ['license_plate_date', 'Date immatriculation'],
      ['product_code', 'Code produit'], ['segment', 'Segment'], ['color', 'Couleur'],
      ['options', 'Options'], ['mileage', 'Kilométrage'], ['mvsc_pos_code', 'Code MVSC/POS'],
      ['sales_channel', 'Canal de vente'], ['sale_number', 'Numéro de vente'],
      ['reference_month', 'Mois de référence'], ['sale_date', 'Date de vente'],
      ['dealer_sale_date', 'Vente au dealer'], ['delivery_date', 'Date de livraison'],
      ['warranty_start_date', 'Début de garantie'],
    ],
  },
  {
    title: 'Après-vente',
    fields: [
      ['repair_order_number', 'Ordre de réparation'], ['workshop_entry_date', 'Entrée atelier'],
      ['workshop_exit_date', 'Sortie atelier'], ['intervention_type', 'Type intervention'],
      ['intervention_subtype', 'Sous-type intervention'], ['intervention_load_date', 'Chargement intervention'],
    ],
  },
  {
    title: 'Client',
    fields: [
      ['customer_name', 'Client'], ['customer_company_name', 'Société'],
      ['customer_person_type', 'Type de personne'], ['customer_contact', 'Contact'],
      ['customer_document_type', 'Type de document'], ['customer_document_number', 'Numéro de document'],
      ['customer_email', 'E-mail'], ['customer_phone', 'Téléphone'], ['customer_mobile', 'Mobile'],
      ['customer_address', 'Adresse'], ['customer_address_number', 'Numéro'],
      ['customer_address_complement', 'Complément'], ['customer_district', 'Quartier'],
      ['customer_city', 'Ville'], ['customer_state', 'État'], ['customer_postal_code', 'Code postal'],
      ['customer_country', 'Pays'], ['customer_market_code', 'Code marché client'], ['extract_date', 'Date extraction'],
    ],
  },
]

const PAGE_SIZE = 25
const DEFAULT_SUPABASE_URL = 'https://rmjxrloyrtcfpfckvooy.supabase.co'

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

export default function DatabasePage({ publicKey, setPublicKey, accessToken, setAccessToken }) {
  const requestRef = useRef(null)
  const [survey, setSurvey] = useState('1')
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedRow, setSelectedRow] = useState(null)
  const [selectedView, setSelectedView] = useState('details')
  const [diagnostic, setDiagnostic] = useState(null)
  const [diagnosticStatus, setDiagnosticStatus] = useState('idle')

  useEffect(() => () => requestRef.current?.abort(), [])

  const loadData = useCallback(async () => {
    if (!publicKey.trim()) {
      setStatus('error')
      setError('Renseignez une clé publique Supabase.')
      return
    }
    if (publicKey.trim().startsWith('sb_secret_') || publicKey.trim().startsWith('service_role')) {
      setStatus('error')
      setError('Utilisez une clé publique sb_publishable_* ou anon dans le navigateur.')
      return
    }
    if (!/^\d+$/u.test(survey.trim())) {
      setStatus('error')
      setError('Le survey doit être un identifiant numérique.')
      return
    }
    try {
      validateBrowserAccessToken(accessToken)
    } catch (caughtError) {
      setStatus('error')
      setError(caughtError.message)
      return
    }

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setStatus('loading')
    setError('')
    setPage(1)

    try {
      const parameters = new URLSearchParams({
        survey: `eq.${survey.trim()}`,
        select: '*',
        order: 'id.asc',
      })
      const headers = { apikey: publicKey.trim(), Prefer: 'count=exact' }
      if (accessToken.trim()) headers.Authorization = `Bearer ${accessToken.trim()}`
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL}/rest/v1/uploads?${parameters}`,
        { headers, signal: controller.signal },
      )
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        const requestError = new Error(`Supabase a retourné HTTP ${response.status}.`)
        requestError.details = body
        throw requestError
      }
      setRows(Array.isArray(body) ? body : [])
      setStatus('success')
    } catch (caughtError) {
      if (caughtError.name === 'AbortError') {
        setStatus('cancelled')
      } else {
        setStatus('error')
        setError(caughtError.details?.message || caughtError.message || 'Erreur de chargement.')
      }
    } finally {
      requestRef.current = null
    }
  }, [accessToken, publicKey, survey])

  const diagnoseAccess = useCallback(async () => {
    if (!publicKey.trim()) return
    try {
      const tokenInspection = validateBrowserAccessToken(accessToken)
      setDiagnosticStatus('loading')
      setDiagnostic(null)
      const headers = { apikey: publicKey.trim(), 'Content-Type': 'application/json' }
      if (!tokenInspection.empty) headers.Authorization = `Bearer ${accessToken.trim()}`
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL}/rest/v1/rpc/debug_auth_context`,
        { method: 'POST', headers, body: '{}' },
      )
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.message || `Diagnostic HTTP ${response.status}.`)
      setDiagnostic(body)
      setDiagnosticStatus('success')
    } catch (caughtError) {
      setDiagnostic({ error: caughtError.message })
      setDiagnosticStatus('error')
    }
  }, [accessToken, publicKey])

  useEffect(() => {
    if (!selectedRow) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedRow(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedRow])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr')
    if (!query) return rows
    return rows.filter((row) => JSON.stringify(row).toLocaleLowerCase('fr').includes(query))
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const tokenInspection = useMemo(() => inspectBrowserAccessToken(accessToken), [accessToken])
  const selectedHistory = historyEntries(selectedRow?.history)
  const selectedModifications = modificationEntries(selectedRow?.last_modifications)

  const openRow = (row, view) => {
    setSelectedRow(row)
    setSelectedView(view)
  }

  return (
    <section className="database-page">
      <div className="database-controls">
        <label className="field survey-field"><span>Survey</span><input type="number" min="1" step="1" value={survey} onChange={(event) => setSurvey(event.target.value)} /></label>
        <label className="field"><span>Clé publique Supabase</span><input type="password" value={publicKey} onChange={(event) => setPublicKey(event.target.value)} placeholder="sb_publishable_... ou clé anon" autoComplete="off" /></label>
        <label className="field"><span>Jeton utilisateur (optionnel)</span><input type="password" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} placeholder="JWT d'une session authentifiée" autoComplete="off" /></label>
        <div className="database-control-actions">
          <button className="button primary" type="button" onClick={loadData} disabled={status === 'loading' || !publicKey.trim()}><RefreshCw size={17} />Charger</button>
          <button className="button secondary" type="button" onClick={diagnoseAccess} disabled={diagnosticStatus === 'loading' || !publicKey.trim()}><ShieldCheck size={17} />Tester l'accès</button>
          {status === 'loading' && <button className="button danger" type="button" onClick={() => requestRef.current?.abort()}><Square size={16} />Interrompre</button>}
        </div>
      </div>

      <div className={`auth-diagnostic ${tokenInspection.valid ? '' : 'invalid'}`}><ShieldCheck size={18} /><div><strong>{tokenInspection.empty ? 'Requête anonyme' : tokenInspection.valid ? 'JWT utilisateur détecté' : 'JWT refusé'}</strong><span>{tokenInspection.valid ? `Rôle : ${tokenInspection.role}${tokenInspection.sub ? ` · UID : ${tokenInspection.sub}` : ''}${tokenInspection.exp ? ` · expiration : ${new Date(tokenInspection.exp * 1000).toLocaleString('fr-FR')}` : ''}` : tokenInspection.error}</span>{diagnostic && <code>{diagnostic.error ? diagnostic.error : `Serveur : rôle ${diagnostic.role ?? '-'} · UID ${diagnostic.uid ?? 'null'}`}</code>}</div></div>

      {status === 'loading' && <div className="database-status"><LoaderCircle className="spin" size={19} /><span>Chargement du survey {survey}...</span></div>}
      {status === 'cancelled' && <div className="database-status"><span>Chargement interrompu.</span></div>}
      {error && <div className="message error-message" role="alert"><AlertCircle size={20} /><div><strong>Lecture impossible</strong><span>{error}</span></div></div>}

      <div className="database-data-panel">
        <div className="database-data-header">
          <div><h2>Données stockées</h2><span>{filteredRows.length.toLocaleString('fr-FR')} ligne(s) pour le survey {survey}</span></div>
          <label className="database-search"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Rechercher dans les données" aria-label="Rechercher dans les données" /></label>
        </div>

        {status !== 'loading' && rows.length === 0 ? (
          <div className="database-empty"><Database size={30} /><strong>{status === 'success' ? 'Aucune ligne visible' : 'Aucune donnée chargée'}</strong><span>{status === 'success' ? 'Vérifiez le survey et la politique RLS SELECT appliquée à cette clé.' : 'Choisissez un survey puis lancez le chargement.'}</span></div>
        ) : (
          <>
            <div className="table-scroll database-table-scroll"><table><thead><tr>{DISPLAY_COLUMNS.map((column) => <th key={column.key}>{column.label}</th>)}<th className="history-column">Actions</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id ?? `${row.batch_id}:${row.row_number}:${row.vin ?? ''}`}>{DISPLAY_COLUMNS.map((column) => <td key={column.key} title={displayValue(row[column.key])}>{displayValue(row[column.key])}</td>)}<td className="history-column"><div className="row-actions"><button className="icon-button small-icon" type="button" title="Voir tous les champs" aria-label={`Voir les détails de la ligne ${row.row_number}`} onClick={() => openRow(row, 'details')}><Eye size={16} /></button><button className="button secondary small" type="button" onClick={() => openRow(row, 'history')}><History size={15} />Historique ({historyEntries(row.history).length})</button></div></td></tr>)}</tbody></table></div>
            <div className="pagination"><span>Page {page} / {pageCount}</span><button type="button" title="Page précédente" aria-label="Page précédente" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}><ChevronLeft size={18} /></button><button type="button" title="Page suivante" aria-label="Page suivante" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount}><ChevronRight size={18} /></button></div>
          </>
        )}
      </div>

      {selectedRow && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedRow(null)}>
          <section className="history-dialog record-dialog" role="dialog" aria-modal="true" aria-labelledby="record-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><h2 id="record-title">Ligne {selectedRow.row_number} · version {displayValue(selectedRow.version)}</h2><span>{selectedRow.file_name} · {selectedRow.vin || 'VIN absent'}</span></div>
              <button className="icon-button" type="button" title="Fermer" aria-label="Fermer" onClick={() => setSelectedRow(null)}><X size={20} /></button>
            </header>
            <nav className="record-tabs" aria-label="Vues de la ligne">
              <button type="button" className={selectedView === 'details' ? 'active' : ''} onClick={() => setSelectedView('details')}>Détails</button>
              <button type="button" className={selectedView === 'history' ? 'active' : ''} onClick={() => setSelectedView('history')}>Historique ({selectedHistory.length})</button>
              <button type="button" className={selectedView === 'changes' ? 'active' : ''} onClick={() => setSelectedView('changes')}>Modifications ({selectedModifications.length})</button>
              <button type="button" className={selectedView === 'raw' ? 'active' : ''} onClick={() => setSelectedView('raw')}>Données brutes</button>
            </nav>
            <div className="record-dialog-content">
              {selectedView === 'details' && <div className="record-details">{DETAIL_SECTIONS.map((section) => <section key={section.title}><h3>{section.title}</h3><dl>{section.fields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd title={displayValue(selectedRow[key])}>{displayValue(selectedRow[key])}</dd></div>)}</dl></section>)}</div>}
              {selectedView === 'history' && (selectedHistory.length > 0 ? <div className="history-list">{[...selectedHistory].reverse().map((entry, index) => <article key={`${entry.version ?? index}:${entry.replaced_at ?? index}`}><header><strong>Version {displayValue(entry.version)}</strong><time>{displayValue(entry.replaced_at)}</time></header><div className="history-meta"><span>Fichier : {displayValue(entry.file_name)}</span><span>Ligne : {displayValue(entry.row_number)}</span><span>Batch : {displayValue(entry.batch_id)}</span></div><div className="changed-fields">{(entry.changed_fields ?? []).map((field) => <code key={field}>{field}</code>)}</div><details><summary>Données de cette version</summary><pre>{JSON.stringify(entry.data ?? {}, null, 2)}</pre></details></article>)}</div> : <pre>{JSON.stringify(selectedRow.history ?? {}, null, 2)}</pre>)}
              {selectedView === 'changes' && (selectedModifications.length > 0 ? <div className="changes-table-wrap"><table className="changes-table"><thead><tr><th>Champ</th><th>Ancienne valeur</th><th>Nouvelle valeur</th></tr></thead><tbody>{selectedModifications.map((change) => <tr key={change.field}><th>{change.field}</th><td>{displayValue(change.oldValue)}</td><td>{displayValue(change.newValue)}</td></tr>)}</tbody></table></div> : <div className="record-empty">Aucune dernière modification enregistrée.</div>)}
              {selectedView === 'raw' && <pre>{JSON.stringify(selectedRow.raw_data ?? {}, null, 2)}</pre>}
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
