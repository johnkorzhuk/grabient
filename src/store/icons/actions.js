export const TOGGLE_TRASH_ICON = 'icons/TOGGLE_TRASH_ICON'
export const INVERT_TRASH_ICON = 'icons/INVERT_TRASH_ICON'

export const toggleTrashIcon = () => dispatch => {
  return dispatch({
    type: TOGGLE_TRASH_ICON
  })
}

export const invertTrashIcon = () => dispatch => {
  return dispatch({
    type: INVERT_TRASH_ICON
  })
}
