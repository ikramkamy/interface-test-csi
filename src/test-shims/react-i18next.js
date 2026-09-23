const MESSAGES = {
  'encuesta.tokenInvalido': 'Lien de questionnaire invalide',
  'encuesta.tokenInvalidoSub': 'Utilise le token demo-pv ou demo-vn pour ouvrir une passation de test.',
  'encuesta.gracias': 'Gracias por su tiempo y su evaluación. La encuesta ha finalizado.',
  'encuesta.graciasSub': 'La respuesta de test quedó guardada localmente en el navegador.',
  'encuesta.anterior': 'Anterior',
  'encuesta.siguiente': 'Siguiente',
  'encuesta.enviar': 'Finalizar',
}

export function useTranslation() {
  return {
    t(key) {
      return MESSAGES[key] ?? key
    },
  }
}
