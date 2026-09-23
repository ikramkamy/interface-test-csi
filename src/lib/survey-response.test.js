import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSurveyResponsePayload, detectDevice, lookupGpsCountry, parseCookies, questionKey } from './survey-response.js'

test('déduit le pays GPS ISO-2 depuis des coordonnées locales', () => {
  assert.equal(lookupGpsCountry(8.9824, -79.5199), 'PA')
})

test('normalise les clés de questions du questionnaire', () => {
  assert.equal(questionKey('question_1'), 'q1')
  assert.equal(questionKey('question_4_specify'), 'q4_specify')
})

test('parse les cookies lisibles du navigateur', () => {
  assert.deepEqual(parseCookies('consent=granted; locale=es-PA; session=a91f'), {
    consent: 'granted',
    locale: 'es-PA',
    session: 'a91f',
  })
})

test('détecte le type de device avec user-agent et largeur', () => {
  assert.equal(detectDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)', 390), 'mobile')
  assert.equal(detectDevice('Mozilla/5.0', 1366), 'desktop')
})

test('construit la structure responses avec les champs frontend disponibles', () => {
  const pasos = [{
    id: 'q1_q2',
    campos: [
      { name: 'question_1', tipo: 'nps' },
      { name: 'question_2', tipo: 'opciones' },
      { name: 'question_4_specify', tipo: 'texto', condicional: { campo: 'question_2', valor: 'Otro' } },
    ],
  }]
  const payload = buildSurveyResponsePayload({
    invitation: { estudio: 'PV' },
    pasos,
    respuestas: { question_1: '5', question_2: 'Otro', question_4_specify: 'Detalle' },
    questionSeconds: { question_1: 9.3, question_2: 14, question_4_specify: 63 },
    isCampoActivo: (campo, respuestas) => !campo.condicional || respuestas[campo.condicional.campo] === campo.condicional.valor,
    responseStart: '2026-08-24T14:02:11.000Z',
    submissionTime: '2026-08-24T14:03:48.000Z',
    interruptions: 2,
    gps: { latitude: 8.9824, longitude: -79.5199, country: 'PA' },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)',
    viewportWidth: 390,
    cookies: { consent: 'granted' },
    rawPayload: { note: 'test' },
    completed: true,
  })

  assert.equal(payload.flow_type, 'PV')
  assert.equal(payload.completed_validated_by_customer, true)
  assert.equal(payload.questions_count, 3)
  assert.equal(payload.answered_count, 3)
  assert.equal(payload.duration_seconds, 97)
  assert.equal(payload.time_per_question, 32.33)
  assert.equal(payload.completion_rate, 100)
  assert.equal(payload.device, 'mobile')
  assert.equal(payload.gps_country, 'PA')
  assert.deepEqual(payload.form.q1, { answer: '5', seconds: 9 })
  assert.deepEqual(payload.form.q4_specify, { answer: 'Detalle', seconds: 63 })
  assert.equal(payload.invitation_token_hash, null)
  assert.equal(payload.bot_score, null)
})
