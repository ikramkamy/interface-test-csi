const DEFAULT_SUPABASE_URL = 'https://rmjxrloyrtcfpfckvooy.supabase.co'
const RPC_NAME = 'upsert_survey_response'

function validateBrowserKey(key) {
  if (!key) throw new Error('Renseignez VITE_SUPABASE_PUBLISHABLE_KEY pour envoyer les réponses questionnaire.')
  if (key.startsWith('sb_secret_') || key.startsWith('service_role')) {
    throw new Error('Une clé secrète ou service_role ne peut pas être utilisée dans le navigateur.')
  }
}

export const surveyResponseService = {
  async upsert({ invitationToken, payload, publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? DEFAULT_SUPABASE_URL, signal } = {}) {
    validateBrowserKey(publicKey.trim())
    if (!invitationToken) throw new Error('Token invitation manquant pour la réponse questionnaire.')
    const url = `${(supabaseUrl || DEFAULT_SUPABASE_URL).replace(/\/$/u, '')}/rest/v1/rpc/${RPC_NAME}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: publicKey.trim(),
        Authorization: `Bearer ${publicKey.trim()}`,
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({ invitation_token: invitationToken, payload }),
    })
    const text = await response.text()
    let body = null
    if (text) {
      try { body = JSON.parse(text) } catch { body = text }
    }
    if (!response.ok) {
      const error = new Error(`Supabase responses RPC a retourné HTTP ${response.status}.`)
      error.status = response.status
      error.details = body
      throw error
    }
    return body
  },
}
