export const TOGGLE_SORTING = 'swatch/TOGGLE_SORTING'

export const toggleSorting = timeout => dispatch => {
  if (timeout) {
    setTimeout(() => {
      dispatch({
        type: TOGGLE_SORTING
      })
    }, timeout)
  } else {
    dispatch({
      type: TOGGLE_SORTING
    })
  }
}
