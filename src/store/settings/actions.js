export const TOGGLE_PREFIXES = 'settings/TOGGLE_PREFIXES'
export const TOGGLE_FALLBACK = 'settings/TOGGLE_FALLBACK'

export const togglePrefixes = () => dispatch => {
  dispatch({
    type: TOGGLE_PREFIXES
  })
}

export const toggleFallback = () => dispatch => {
  dispatch({
    type: TOGGLE_FALLBACK
  })
}
