import { validateBrowserAccessToken } from './auth.js'

const DEFAULT_SUPABASE_URL = 'https://rmjxrloyrtcfpfckvooy.supabase.co'
const invisibleCharacters = /\u00AD|\u200B|\u200C|\u200D|\u2060|\uFEFF/gu

function repairMojibake(value) {
  if (!/[ÃÂ]/u.test(value)) return value
  try {
    const bytes = Uint8Array.from(value, (character) => character.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return value
  }
}

export function normalizeHeader(value) {
  return repairMojibake(String(value ?? ''))
    .replace(invisibleCharacters, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('und')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
}

function sourceKeys(headers) {
  const occurrences = new Map()
  return headers.map((header, index) => {
    const sourceHeader = String(header ?? '').trim() || `COLONNE_${index + 1}`
    const count = (occurrences.get(sourceHeader) ?? 0) + 1
    occurrences.set(sourceHeader, count)
    return count === 1 ? sourceHeader : `${sourceHeader}__${count}`
  })
}

function parseYear(value) {
  const year = Number(value)
  return String(value).length === 2 ? (year >= 70 ? 1900 + year : 2000 + year) : year
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function normalizeDate(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10)
  const text = String(value).trim()
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/u)
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const compact = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/u)
  if (compact) {
    const first = Number(compact[1])
    const second = Number(compact[2])
    const year = parseYear(compact[3])
    const [month, day] = second > 12 ? [first, second] : first > 12 ? [second, first] : [first, second]
    return validDate(year, month, day)
  }
  const parsed = new Date(text)
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10)
}

function normalizeValue(value, targetType) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  return targetType === 'date' ? normalizeDate(value) : String(value).trim()
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function acceptedSheetNames(flowMapping) {
  return [flowMapping.sheet_name, ...(flowMapping.sheet_aliases ?? [])]
}

function columnsByKey(flowMapping) {
  const mappingByKey = new Map()
  for (const column of flowMapping.columns) {
    mappingByKey.set(column.normalized_key, column)
    for (const alias of column.aliases ?? []) mappingByKey.set(alias, column)
  }
  return mappingByKey
}

// Plusieurs flux peuvent partager un nom de feuille (ex. « Datos ») : on départage par les en-têtes reconnus.
export function detectFlow(workbook, mapping, fallbackFlow) {
  let best = null
  for (const [flow, flowMapping] of Object.entries(mapping.flows ?? {})) {
    const mappingByKey = columnsByKey(flowMapping)
    for (const sheetName of acceptedSheetNames(flowMapping)) {
      const worksheet = workbook.find((sheet) => sheet.sheet === sheetName)
      if (!worksheet) continue
      const score = (worksheet.data[0] ?? []).filter((header) => mappingByKey.has(normalizeHeader(header))).length
      if (!best || score > best.score) best = { flow, sheetName, score }
    }
  }
  return best ?? { flow: fallbackFlow, sheetName: workbook[0]?.sheet }
}

export async function prepareIngestion(payload, mapping, now = new Date()) {
  const flow = String(payload.activity ?? '').toUpperCase()
  const flowMapping = mapping.flows?.[flow]
  if (!flowMapping) throw new Error('Flux inconnu. Valeurs autorisées : PV ou VN.')
  if (!payload.file?.name || !payload.file?.sha256 || !payload.file?.sheetName) throw new Error('Métadonnées du fichier incomplètes.')
  if (!Array.isArray(payload.headers) || !Array.isArray(payload.rows) || payload.rows.length === 0) throw new Error('Le fichier ne contient aucune ligne exploitable.')
  if (payload.headers.length !== flowMapping.expected_column_count) throw new Error(`${flowMapping.expected_column_count} colonnes attendues, ${payload.headers.length} reçues.`)
  const sheetNames = acceptedSheetNames(flowMapping)
  if (!sheetNames.includes(payload.file.sheetName)) throw new Error(`La feuille attendue pour ${flow} est « ${sheetNames.join(' » ou « ')} ».`)

  const mappingByKey = columnsByKey(flowMapping)
  const keys = payload.columns?.length === payload.headers.length ? payload.columns.map((column) => column.key) : sourceKeys(payload.headers)
  const resolved = payload.headers.map((header, index) => {
    const normalizedKey = normalizeHeader(header)
    return { header, sourceKey: keys[index], normalizedKey, column: mappingByKey.get(normalizedKey) }
  })
  const unknownHeaders = resolved.filter((item) => !item.column).map((item) => item.header)
  const resolvedKeys = new Set(resolved.filter((item) => item.column).map((item) => item.column.normalized_key))
  const missingHeaders = flowMapping.columns.filter((column) => !resolvedKeys.has(column.normalized_key)).map((column) => column.source_header)
  const duplicatedTargets = resolved.filter((item, index, list) => item.column && list.findIndex((other) => other.column?.target_column === item.column.target_column) !== index).map((item) => item.header)
  if (unknownHeaders.length || missingHeaders.length || duplicatedTargets.length) {
    const error = new Error('Les en-têtes ne correspondent pas au mapping configuré.')
    error.details = { mappingVersion: mapping.mapping_version, unknownHeaders, missingHeaders, duplicatedTargets }
    throw error
  }

  const batchId = String(now.getTime())
  const importedAt = now.toISOString()
  const targetColumns = [...new Set(flowMapping.columns.map((column) => column.target_column))]
  const rows = await Promise.all(payload.rows.map(async (sourceRow, rowIndex) => {
    const mapped = Object.fromEntries(targetColumns.map((column) => [column, null]))
    for (const item of resolved) mapped[item.column.target_column] = normalizeValue(sourceRow[item.sourceKey], item.column.target_type)
    const rowNumber = Number(sourceRow.__rowNumber) || rowIndex + 2
    const rowId = (BigInt(batchId) * 1_000_000n + BigInt(rowIndex + 1)).toString()
    const hashSource = { flow, file_sha256: payload.file.sha256, row_number: rowNumber, data: mapped }
    return {
      ...mapped,
      id: rowId,
      flow_type: flow,
      survey: flow === 'PV' ? 1 : 6,
      batch_id: batchId,
      file_name: payload.file.name,
      file_sha256: payload.file.sha256,
      sheet_name: payload.file.sheetName,
      row_number: String(rowNumber),
      row_hash: await sha256(stableStringify(hashSource)),
      model: mapped.model ?? '',
      engine: mapped.engine ?? '',
      version: 1,
    }
  }))

  return {
    batch: {
      id: batchId,
      chargement_date: importedAt,
      code: `CSI-${flow}-${batchId}`,
      default_language: flow === 'VN' ? 'pt' : 'es',
      languages: [flow === 'VN' ? 'pt' : 'es'],
      customers: [],
      canceled: false,
      pending: true,
      vague: flow,
      version: 1,
    },
    rows,
    mappingVersion: mapping.mapping_version,
  }
}

function validateBrowserKey(key) {
  if (!key) throw new Error('Renseignez une clé publique Supabase.')
  if (key.startsWith('sb_secret_') || key.startsWith('service_role')) {
    throw new Error('Une clé secrète ou service_role ne peut pas être utilisée dans le navigateur.')
  }
}

async function supabaseRequest({ url, key, accessToken, resource, method = 'GET', body, prefer = 'return=minimal', signal }) {
  validateBrowserKey(key)
  validateBrowserAccessToken(accessToken)
  const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: prefer }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  const response = await fetch(`${url.replace(/\/$/u, '')}/rest/v1/${resource}`, {
    method,
    headers,
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let responseBody = null
  if (text) {
    try { responseBody = JSON.parse(text) } catch { responseBody = text }
  }
  if (!response.ok) {
    const error = new Error(`Supabase a retourné HTTP ${response.status}.`)
    error.status = response.status
    error.details = responseBody
    throw error
  }
  return responseBody
}

export async function runIngestion(payload, {
  mapping,
  prepared: providedPrepared,
  publicKey,
  accessToken = '',
  supabaseUrl = DEFAULT_SUPABASE_URL,
  dryRun = false,
  chunkSize = 500,
  signal,
  onProgress = () => {},
}) {
  onProgress({ progress: 8, message: 'Validation du fichier et du mapping' })
  const prepared = providedPrepared ?? await prepareIngestion(payload, mapping)
  onProgress({ progress: 25, message: `${prepared.rows.length} ligne(s) traduite(s)` })
  if (dryRun) {
    return {
      mode: 'simulation', batchId: prepared.batch.id, rowsValidated: prepared.rows.length,
      mappingVersion: prepared.mappingVersion,
      sample: prepared.rows.slice(0, 2),
    }
  }

  const requestOptions = { url: supabaseUrl || DEFAULT_SUPABASE_URL, key: publicKey.trim(), accessToken: accessToken.trim(), signal }
  const createdBatch = await supabaseRequest({ ...requestOptions, resource: 'chargements', method: 'POST', body: prepared.batch, prefer: 'return=representation' })
  onProgress({ progress: 35, message: `Chargement ${prepared.batch.id} créé` })
  let insertedRows = 0
  try {
    for (let start = 0; start < prepared.rows.length; start += chunkSize) {
      const chunk = prepared.rows.slice(start, start + chunkSize)
      await supabaseRequest({ ...requestOptions, resource: 'uploads', method: 'POST', body: chunk })
      insertedRows += chunk.length
      onProgress({ progress: 35 + Math.round((insertedRows / prepared.rows.length) * 55), message: `${insertedRows}/${prepared.rows.length} ligne(s) insérée(s)` })
    }
    const completedBatch = await supabaseRequest({
      ...requestOptions,
      resource: `chargements?id=eq.${encodeURIComponent(prepared.batch.id)}`,
      method: 'PATCH', body: { pending: false, canceled: false }, prefer: 'return=representation',
    })
    return {
      mode: 'insertion', batchId: prepared.batch.id, rowsInserted: insertedRows,
      mappingVersion: prepared.mappingVersion,
      chargement: completedBatch?.[0] ?? createdBatch?.[0] ?? prepared.batch,
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      try {
        await supabaseRequest({
          ...requestOptions,
          resource: `chargements?id=eq.${encodeURIComponent(prepared.batch.id)}`,
          method: 'PATCH', body: { pending: false, canceled: true },
        })
      } catch { /* L’erreur d’insertion reste prioritaire. */ }
    }
    throw error
  }
}
