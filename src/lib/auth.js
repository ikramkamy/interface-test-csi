function decodeBase64Url(value) {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return JSON.parse(atob(padded))
}

export function inspectBrowserAccessToken(value) {
  const token = String(value ?? '').trim()
  if (!token) return { valid: true, role: 'anon', sub: null, exp: null, empty: true }
  if (/^Bearer\s+/iu.test(token)) {
    return { valid: false, error: 'Collez uniquement le JWT, sans le préfixe Bearer.' }
  }
  const parts = token.split('.')
  if (parts.length !== 3) return { valid: false, error: 'Le jeton doit être un JWT utilisateur en trois parties.' }
  try {
    const claims = decodeBase64Url(parts[1])
    if (claims.role === 'service_role') {
      return { valid: false, role: claims.role, sub: claims.sub ?? null, exp: claims.exp ?? null, error: 'Le jeton service_role est réservé aux serveurs et interdit dans le navigateur.' }
    }
    if (claims.role !== 'authenticated' || !claims.sub) {
      return { valid: false, role: claims.role ?? null, sub: claims.sub ?? null, exp: claims.exp ?? null, error: 'Ce jeton ne représente pas un utilisateur authentifié.' }
    }
    if (Number(claims.exp) <= Math.floor(Date.now() / 1000)) {
      return { valid: false, role: claims.role, sub: claims.sub, exp: claims.exp, error: 'Le jeton utilisateur a expiré.' }
    }
    return { valid: true, role: claims.role, sub: claims.sub, exp: claims.exp, issuer: claims.iss ?? null, empty: false }
  } catch {
    return { valid: false, error: 'Le contenu du JWT ne peut pas être décodé.' }
  }
}

export function validateBrowserAccessToken(value) {
  const inspection = inspectBrowserAccessToken(value)
  if (!inspection.valid) throw new Error(inspection.error)
  return inspection
}
