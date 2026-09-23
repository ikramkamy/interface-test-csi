import assert from 'node:assert/strict'
import test from 'node:test'
import { historyEntries, modificationEntries } from './database-view.js'

test('accepte le nouvel historique versionné sous forme de tableau', () => {
  const history = [
    { version: 1, changed_fields: ['advisor_name'] },
    { version: 2, changed_fields: ['brand', 'model'] },
  ]

  assert.deepEqual(historyEntries(history), history)
  assert.deepEqual(historyEntries({ imported_at: '2026-08-04' }), [])
})

test('transforme les dernières modifications en lignes comparables', () => {
  assert.deepEqual(modificationEntries({
    brand: { old: 'RAM', new: 'RAM updated' },
    delivery_date: { old: '2026-07-13', new: '2026-07-12' },
  }), [
    { field: 'brand', oldValue: 'RAM', newValue: 'RAM updated' },
    { field: 'delivery_date', oldValue: '2026-07-13', newValue: '2026-07-12' },
  ])
  assert.deepEqual(modificationEntries(null), [])
})
