import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectBrowserAccessToken } from './auth.js'

function tokenWithClaims(claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode(claims)}.signature`
}

test('accepte un access token utilisateur non expiré', () => {
  const result = inspectBrowserAccessToken(tokenWithClaims({ role: 'authenticated', sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 600 }))
  assert.equal(result.valid, true)
  assert.equal(result.sub, 'user-1')
})

test('refuse un jeton service_role dans le navigateur', () => {
  const result = inspectBrowserAccessToken(tokenWithClaims({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 600 }))
  assert.equal(result.valid, false)
  assert.match(result.error, /service_role/u)
})

test('refuse un JWT utilisateur expiré', () => {
  const result = inspectBrowserAccessToken(tokenWithClaims({ role: 'authenticated', sub: 'user-1', exp: 1 }))
  assert.equal(result.valid, false)
  assert.match(result.error, /expiré/u)
})
