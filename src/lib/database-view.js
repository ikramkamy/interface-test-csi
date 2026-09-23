export function historyEntries(history) {
  return Array.isArray(history) ? history : []
}

export function modificationEntries(modifications) {
  if (!modifications || Array.isArray(modifications) || typeof modifications !== 'object') return []

  return Object.entries(modifications).map(([field, change]) => ({
    field,
    oldValue: change?.old,
    newValue: change?.new,
  }))
}
