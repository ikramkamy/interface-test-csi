const STORAGE_KEY = 'csi.encuesta.passations'

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function writePassation(passation) {
  const store = readStore().filter((item) => item.id !== passation.id)
  store.unshift(passation)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store.slice(0, 20)))
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return `passation-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const respuestaEncuestaService = {
  async contexto() {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      screen: `${window.screen.width}x${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      capturedAt: new Date().toISOString(),
    }
  },

  async abrir(invitacion, totalPasos, contexto) {
    const passation = {
      id: makeId(),
      token: invitacion.token,
      estudio: invitacion.estudio,
      client: invitacion.client,
      totalPasos,
      contexto,
      pasos: [],
      statut: 'ouverte',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    writePassation(passation)
    return passation
  },

  async guardarPaso(passation, paso, indice) {
    const next = {
      ...passation,
      pasos: passation.pasos.some((item) => item.indice === indice)
        ? passation.pasos.map((item) => (item.indice === indice ? { indice, ...paso } : item))
        : [...passation.pasos, { indice, ...paso }],
      updatedAt: new Date().toISOString(),
    }
    writePassation(next)
    return next
  },

  async cerrar(passation) {
    const next = {
      ...passation,
      statut: 'envoyee',
      closedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    writePassation(next)
    return next
  },
}
