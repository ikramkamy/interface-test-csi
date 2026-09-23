import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeDate, normalizeHeader, prepareIngestion } from './ingestion.js'

const mapping = {
  mapping_version: 'test',
  flows: {
    PV: {
      sheet_name: 'Data Postventa',
      expected_column_count: 2,
      columns: [
        { source_header: 'Modelo', normalized_key: 'modelo', target_column: 'model', target_type: 'text' },
        { source_header: 'Motorización', normalized_key: 'motorizacion', target_column: 'engine', target_type: 'text' },
      ],
    },
    VN: {
      sheet_name: 'Modelo Ventas',
      expected_column_count: 2,
      columns: [
        { source_header: 'Modelo', normalized_key: 'modelo', target_column: 'model', target_type: 'text' },
        { source_header: 'Motorización', normalized_key: 'motorizacion', target_column: 'engine', target_type: 'text' },
      ],
    },
  },
}

test('normalise les accents, espaces et caractères invisibles', () => {
  assert.equal(normalizeHeader('  Motorización\u200B '), 'motorizacion')
})

test('normalise les principales dates Excel textuelles', () => {
  assert.equal(normalizeDate('7/13/26'), '2026-07-13')
  assert.equal(normalizeDate('2026-07-13'), '2026-07-13')
  assert.equal(normalizeDate(''), null)
})

test('prépare un chargement et ses lignes directement dans le navigateur', async () => {
  const prepared = await prepareIngestion({
    activity: 'PV',
    file: { name: 'pv.xlsx', sha256: 'abc', sheetName: 'Data Postventa' },
    headers: ['Modelo', 'Motorización'],
    columns: [{ key: 'Modelo' }, { key: 'Motorización' }],
    rows: [{ __rowNumber: 2, Modelo: '208', Motorización: null }],
  }, mapping, new Date('2026-08-03T10:00:00.000Z'))
  assert.equal(prepared.batch.id, '1785751200000')
  assert.equal(prepared.rows[0].model, '208')
  assert.equal(prepared.rows[0].engine, '')
  assert.equal(prepared.rows[0].survey, 1)
  assert.equal('history' in prepared.rows[0], false)
  assert.equal('Modelo' in prepared.rows[0], false)
  assert.equal('Motorización' in prepared.rows[0], false)
  assert.match(prepared.rows[0].row_hash, /^[a-f0-9]{64}$/u)
})

test('affecte le survey 6 au flux VN sans générer history', async () => {
  const prepared = await prepareIngestion({
    activity: 'VN',
    file: { name: 'vn.xlsx', sha256: 'def', sheetName: 'Modelo Ventas' },
    headers: ['Modelo', 'Motorización'],
    columns: [{ key: 'Modelo' }, { key: 'Motorización' }],
    rows: [{ __rowNumber: 2, Modelo: 'RAM 700', Motorización: '552821' }],
  }, mapping, new Date('2026-08-06T10:00:00.000Z'))

  assert.equal(prepared.rows[0].survey, 6)
  assert.equal('history' in prepared.rows[0], false)
})

test('rejette un en-tête inconnu', async () => {
  await assert.rejects(prepareIngestion({
    activity: 'PV',
    file: { name: 'pv.xlsx', sha256: 'abc', sheetName: 'Data Postventa' },
    headers: ['Modelo', 'Champ surprise'],
    rows: [{ Modelo: '208', 'Champ surprise': 'x' }],
  }, mapping), /mapping configuré/u)
})
