import { useEffect, useState } from 'react'

function readToken() {
  const params = new URLSearchParams(window.location.search)
  return params.get('token') || params.get('surveyToken') || 'demo-pv'
}

export function useParams() {
  const [token, setToken] = useState(readToken)

  useEffect(() => {
    const refresh = () => setToken(readToken())
    window.addEventListener('popstate', refresh)
    window.addEventListener('survey-token-change', refresh)
    return () => {
      window.removeEventListener('popstate', refresh)
      window.removeEventListener('survey-token-change', refresh)
    }
  }, [])

  return { token }
}
