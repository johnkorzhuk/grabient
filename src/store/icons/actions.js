import { generateLinearGradient } from './../../utils/gradient'
import { copyTextToClipboard } from './utils'

export const TOGGLE_TRASH_ICON = 'icons/TOGGLE_TRASH_ICON'
export const INVERT_TRASH_ICON = 'icons/INVERT_TRASH_ICON'
export const TOGGLE_CSS_COPIED = 'icons/TOGGLE_CSS_COPIED'

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

export const copyCSS = (angle, stopData, id) => dispatch => {
  const css = generateLinearGradient(angle, stopData)
  copyTextToClipboard(css)
  dispatch({
    type: TOGGLE_CSS_COPIED,
    payload: {
      id
    }
  })

  setTimeout(() => {
    return dispatch({
      type: TOGGLE_CSS_COPIED,
      payload: {
        id: null
      }
    })
  }, 2000)
}
