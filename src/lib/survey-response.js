import whichCountry from 'which-country'
import countries from 'i18n-iso-countries'

export function lookupGpsCountry(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const alpha3 = whichCountry([longitude, latitude])
  return alpha3 ? countries.alpha3ToAlpha2(alpha3) ?? null : null
}

export function parseCookies(cookieText = '') {
  if (!cookieText.trim()) return {}
  return Object.fromEntries(cookieText.split(';').map((part) => {
    const [rawKey, ...rawValue] = part.split('=')
    const key = decodeURIComponent(rawKey.trim())
    const value = decodeURIComponent(rawValue.join('=').trim())
    return [key, value]
  }).filter(([key]) => key))
}

export function detectDevice(userAgent = '', width = 1024) {
  const ua = userAgent.toLowerCase()
  if (/iphone|android.*mobile|windows phone/u.test(ua) || width < 768) return 'mobile'
  if (/ipad|tablet|android/u.test(ua) || width < 1024) return 'tablet'
  return 'desktop'
}

export function questionKey(name) {
  const match = String(name ?? '').match(/^question_(\d+)(.*)$/u)
  if (!match) return String(name ?? '')
  return `q${match[1]}${match[2] ?? ''}`
}

export function normalizeAnswer(value) {
  return String(value ?? '').replaceAll('||', ', ')
}

function round2(value) {
  return Number(value.toFixed(2))
}

export function buildSurveyResponsePayload({
  invitation,
  pasos,
  respuestas,
  questionSeconds,
  isCampoActivo,
  responseStart,
  submissionTime = null,
  now = new Date(),
  interruptions = 0,
  gps = {},
  userAgent = '',
  viewportWidth = 1024,
  cookies = {},
  rawPayload = {},
  completed = false,
}) {
  const activeCampos = pasos.flatMap((paso) => paso.campos.filter((campo) => isCampoActivo(campo, respuestas)))
  const form = Object.fromEntries(activeCampos.map((campo) => {
    const answer = normalizeAnswer(respuestas[campo.name])
    return [questionKey(campo.name), {
      answer,
      seconds: Math.max(0, Math.round(questionSeconds[campo.name] ?? 0)),
    }]
  }))

  const questionsCount = activeCampos.length
  const answeredCount = activeCampos.filter((campo) => normalizeAnswer(respuestas[campo.name]).trim() !== '').length
  const startedAt = responseStart ? new Date(responseStart) : now
  const endedAt = submissionTime ? new Date(submissionTime) : now
  const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000))

  return {
    upload_id: null,
    survey: null,
    flow_type: invitation?.estudio ?? null,
    vin: null,
    invitation_token_hash: null,
    form,
    questions_count: questionsCount,
    answered_count: answeredCount,
    response_start: responseStart,
    submission_time: submissionTime,
    duration_seconds: durationSeconds,
    time_per_question: questionsCount ? round2(durationSeconds / questionsCount) : 0,
    completion_rate: questionsCount ? round2((answeredCount / questionsCount) * 100) : 0,
    interruptions,
    ip_address: null,
    ip_country: null,
    user_agent: userAgent,
    device: detectDevice(userAgent, viewportWidth),
    gps_latitude: gps.latitude ?? null,
    gps_longitude: gps.longitude ?? null,
    gps_country: gps.country ?? null,
    country_gps_mismatch: null,
    cookies,
    bot_score: null,
    duplicate_score: null,
    duplicated_respondent: null,
    same_ip_responses: null,
    duration_too_long: null,
    duration_too_short: null,
    straightlining: null,
    same_response_time_per_question: null,
    ballot_box_stuffing: null,
    completed_validated_by_customer: completed,
    proposed_assignment: null,
    decision: null,
    publication_excluded: null,
    raw_payload: rawPayload,
  }
}
